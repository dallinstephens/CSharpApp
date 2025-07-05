using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using CSharpApp.Configuration; // This line is crucial for your config class
using Microsoft.Extensions.Options; // <--- ADD THIS USING STATEMENT

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

// Add Memory Cache service
builder.Services.AddMemoryCache(); // Add this line

// --- START Google Sheets Configuration ---

// 1. Configure GoogleSheetsConfig from appsettings
// CHANGE 1: The section name should match the top-level key in appsettings.json.
// If your appsettings.json has "GoogleSheets": { "SpreadsheetId": ... }, then use "GoogleSheets".
// If it has "GoogleSheetsConfig": { "SpreadsheetId": ... }, then keep "GoogleSheetsConfig".
// I'll assume it's "GoogleSheets" as per our previous discussion for consistency.
builder.Services.Configure<GoogleSheetsConfig>(
    builder.Configuration.GetSection("GoogleSheetsConfig")); // <--- Potentially changed section name

// 2. Register SheetsService as a singleton
builder.Services.AddSingleton<SheetsService>(sp =>
{
    // CHANGE 2: Get the configuration via IOptions<GoogleSheetsConfig> from the service provider
    // This is the idiomatic way when you've registered with Configure<T>
    var config = sp.GetRequiredService<IOptions<GoogleSheetsConfig>>().Value;

    if (config == null || string.IsNullOrEmpty(config.ServiceAccountKeyPath) || string.IsNullOrEmpty(config.SpreadsheetId)) // <--- Added check for SpreadsheetId
    {
        throw new InvalidOperationException("GoogleSheetsConfig, ServiceAccountKeyPath, or SpreadsheetId is not configured correctly in appsettings.Development.json."); // <--- Updated message for clarity
    }

    GoogleCredential credential;
    using (var stream = new FileStream(config.ServiceAccountKeyPath, FileMode.Open, FileAccess.Read))
    {
        credential = GoogleCredential.FromStream(stream)
            .CreateScoped(SheetsService.Scope.Spreadsheets); // Grants access to Google Sheets
    }

    // Create Google Sheets API service.
    var service = new SheetsService(new BaseClientService.Initializer()
    {
        HttpClientInitializer = credential,
        ApplicationName = "CSharp Google Sheets App", // Give your application a name
    });

    return service;
});

// --- END Google Sheets Configuration ---


var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthorization();

// Keep your existing static asset mapping if you need it, but use UseStaticFiles() as well for general static content
app.UseStaticFiles(); // Ensure this is present for static files like CSS/JS
// app.MapStaticAssets(); // If this is a custom extension method, ensure it's defined.
// If your static assets are only served by UseStaticFiles(), you might not need this.

app.MapControllerRoute(
    name: "default",
    // pattern: "{controller=Home}/{action=Index}/{id?}") // Original line
    pattern: "{controller=Home}/{action=SheetData}/{id?}"); // This makes SheetData the default
    // .WithStaticAssets(); // If this is a custom extension method, ensure it's defined.

app.Run();