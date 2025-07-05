using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using CSharpApp.Models;
using Google.Apis.Sheets.v4;
using Google.Apis.Sheets.v4.Data;
using Microsoft.Extensions.Options;
using CSharpApp.Configuration;
using Microsoft.Extensions.Caching.Memory;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System; // Make sure this is present for DateTime and TimeSpan

namespace CSharpApp.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly SheetsService _sheetsService;
        private readonly GoogleSheetsConfig _googleSheetsConfig;
        private readonly IMemoryCache _cache;

        // Constructor for dependency injection
        public HomeController(ILogger<HomeController> logger, SheetsService sheetsService,
            IOptions<GoogleSheetsConfig> googleSheetsConfig, IMemoryCache cache)
        {
            _logger = logger;
            _sheetsService = sheetsService;
            _googleSheetsConfig = googleSheetsConfig.Value;
            _cache = cache;
        }

        public IActionResult Index()
        {
            return View();
        }

        // Define your CachedGoogleSheetData class
        // It's good practice to put this in a separate file (e.g., Models/CachedGoogleSheetData.cs)
        // but for integration, I'll place it here temporarily.
        public class CachedGoogleSheetData
        {
            public List<List<string>> Data { get; set; } = new List<List<string>>(); // Initialize to prevent null ref
            public int RowCount { get; set; }
            public DateTime FetchedAt { get; set; }
        }

        // Modified SheetData action to accept a search query
        public async Task<IActionResult> SheetData(string searchQuery)
        {
            string spreadsheetId = _googleSheetsConfig.SpreadsheetId;
            string sheetName = "Retailer Store"; // Extract sheet name to use with GetSheetRowCount
            string range = $"{sheetName}!A:F";
            string cacheKey = "GoogleSheetData";

            List<List<string>> allRows = new List<List<string>>(); // This will hold the final, filtered rows for display
            CachedGoogleSheetData? cachedDataWrapper = null; // Used to hold data retrieved from cache

            // --- NEW LOGIC: Check time window for forced cache usage ---
            // Using DateTime.Now to get local time. If your server is in a different timezone
            // than your expected refresh times, consider DateTime.UtcNow and convert accordingly.
            DateTime currentTime = DateTime.Now;
            bool forceCacheUsage = currentTime.Hour >= 0 && currentTime.Hour < 8; // Between Midnight (00:00) and 8 AM (exclusive)

            if (forceCacheUsage)
            {
                // Attempt to get data from cache
                if (_cache.TryGetValue(cacheKey, out cachedDataWrapper))
                {
                    allRows = cachedDataWrapper!.Data; // Use data from cache (null-forgiving operator as TryGetValue ensures non-null)
                    _logger.LogInformation($"[{currentTime:HH:mm}] Forced cache usage between 00:00-08:00. Using cached data.");
                }
                else
                {
                    // Cache is empty even within the safe window, so we must fetch from Google Sheet
                    _logger.LogWarning($"[{currentTime:HH:mm}] Cache empty within 00:00-08:00 window. Proceeding to fetch data to populate cache.");
                    // Fall through to the fetching logic below
                }
            }
            // --- END NEW LOGIC ---


            // This block executes if:
            // 1. We are *outside* the 00:00-08:00 window.
            // 2. We *are* inside the 00:00-08:00 window, but the cache was empty (cachedDataWrapper is null).
            if (!allRows.Any()) // Only proceed with fetching/revalidation if allRows is still empty
            {
                // Try to get the wrapped data from cache for conditional revalidation (if not forced cache usage)
                if (_cache.TryGetValue(cacheKey, out cachedDataWrapper))
                {
                    _logger.LogInformation($"[{currentTime:HH:mm}] Attempting to fetch data from cache with row count revalidation.");

                    // Step 1: Get current row count from Google Sheet metadata (API call)
                    int currentSheetRowCount = await GetSheetRowCount(spreadsheetId, sheetName);

                    if (cachedDataWrapper!.RowCount == currentSheetRowCount)
                    {
                        // Cache hit AND row counts match: Use cached data
                        allRows = cachedDataWrapper.Data;
                        _logger.LogInformation($"[{currentTime:HH:mm}] Using cached data. Row count ({currentSheetRowCount}) matches cached.");
                    }
                    else
                    {
                        // Row count mismatch: Cache invalid, re-fetch data (log and fall through)
                        _logger.LogInformation($"[{currentTime:HH:mm}] Cached row count ({cachedDataWrapper.RowCount}) differs from current ({currentSheetRowCount}). Re-fetching data.");
                        // The code will now proceed to the 'try' block below for a full re-fetch
                    }
                }

                // This nested if block executes if:
                // - The initial _cache.TryGetValue failed (true cache miss)
                // - Or, if _cache.TryGetValue succeeded, but the row counts didn't match (cache invalidation)
                if (!allRows.Any()) // Check again if allRows is still empty, meaning no valid cache to use
                {
                    _logger.LogInformation($"[{currentTime:HH:mm}] Performing full data fetch from Google Sheet (cache miss or invalidation).");
                    try
                    {
                        SpreadsheetsResource.ValuesResource.GetRequest request =
                            _sheetsService.Spreadsheets.Values.Get(spreadsheetId, range);

                        ValueRange response = await request.ExecuteAsync();
                        IList<IList<object>>? values = response.Values;

                        // Process and filter the rows (your existing logic)
                        if (values != null && values.Any())
                        {
                            foreach (var row in values)
                            {
                                if (row.Count > 0 && (row[0] == null || string.IsNullOrWhiteSpace(row[0].ToString())))
                                {
                                    _logger.LogInformation($"[{currentTime:HH:mm}] Stopped processing Google Sheet rows due to empty Column A cell.");
                                    break;
                                }
                                var stringRow = new List<string>();
                                for (int i = 0; i < row.Count; i++)
                                {
                                    stringRow.Add(row[i]?.ToString() ?? string.Empty);
                                }
                                allRows.Add(stringRow);
                            }

                            // After fetching and filtering, get the definitive current total row count for caching
                            int actualFetchedRowCount = await GetSheetRowCount(spreadsheetId, sheetName);

                            // Only cache if there's actual data after filtering by Column A
                            if (allRows.Any())
                            {
                                var newCachedDataWrapper = new CachedGoogleSheetData
                                {
                                    Data = allRows,
                                    RowCount = actualFetchedRowCount, // Store the total sheet row count from metadata
                                    FetchedAt = DateTime.UtcNow // Store when it was fetched (UTC for consistency)
                                };

                                var cacheEntryOptions = new MemoryCacheEntryOptions()
                                    .SetAbsoluteExpiration(TimeSpan.FromDays(1)); // Still cache for 1 day, but row count invalidates faster
                                _cache.Set(cacheKey, newCachedDataWrapper, cacheEntryOptions);
                                _logger.LogInformation($"[{currentTime:HH:mm}] Data with {allRows.Count} filtered rows (Sheet Total: {actualFetchedRowCount}) cached for 1 day, with row count validation.");
                            }
                            else
                            {
                                ViewBag.Message = "No meaningful data found from Google Sheet after filtering by Column A.";
                                _logger.LogWarning($"[{currentTime:HH:mm}] Google Sheet returned no meaningful data after Column A filter.");
                            }
                        }
                        else
                        {
                            ViewBag.Message = "Google Sheet returned no data.";
                            _logger.LogWarning($"[{currentTime:HH:mm}] Google Sheet API returned no data or null values.");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"[{currentTime:HH:mm}] Error reading from Google Sheet. Displaying empty table.");
                        ViewBag.Message = $"Error: {ex.Message}";
                    }
                }
            }


            // --- Header & Search Filtering Logic (remains the same) ---
            // At this point, 'allRows' is guaranteed to be initialized and assigned
            // (either from cache, or a new fetch, or an empty list if error/no data).
            List<string> headerRow = new List<string>();
            List<List<string>> dataRows = new List<List<string>>();

            if (allRows.Any())
            {
                headerRow = allRows[0];
                dataRows = allRows.Skip(1).ToList();
            }

            if (!string.IsNullOrEmpty(searchQuery))
            {
                ViewBag.CurrentFilter = searchQuery;
                dataRows = dataRows
                    .Where(row =>
                    {
                        bool hasFirstColumn = row.Count > 0 && row[0].Contains(searchQuery, StringComparison.OrdinalIgnoreCase);
                        bool hasSecondColumn = row.Count > 1 && row[1].Contains(searchQuery, StringComparison.OrdinalIgnoreCase);
                        return hasFirstColumn || hasSecondColumn;
                    })
                    .ToList();
            }

            List<List<string>> displayData = new List<List<string>>();
            if (headerRow.Any())
            {
                displayData.Add(headerRow);
            }
            displayData.AddRange(dataRows);

            return View(displayData);
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }

        // Helper method to get the total row count of a specific sheet from its metadata
        private async Task<int> GetSheetRowCount(string spreadsheetId, string sheetName)
        {
            try
            {
                var request = _sheetsService.Spreadsheets.Get(spreadsheetId);
                // Request only the properties of the sheets, specifically gridProperties.rowCount and title
                request.Fields = "sheets.properties.title,sheets.properties.gridProperties.rowCount";

                var spreadsheet = await request.ExecuteAsync();

                // Find the specific sheet by name
                var targetSheet = spreadsheet.Sheets?.FirstOrDefault(s => s.Properties?.Title == sheetName);

                if (targetSheet?.Properties?.GridProperties != null)
                {
                    return targetSheet.Properties.GridProperties.RowCount ?? 0;
                }
                _logger.LogWarning($"Could not find sheet '{sheetName}' or its row count properties in spreadsheet '{spreadsheetId}'.");
                return 0; // Return 0 if sheet not found or no row count
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting row count for sheet '{sheetName}' in spreadsheet '{spreadsheetId}'. Returning 0.");
                return 0; // Return 0 in case of API error
            }
        }
    }
}