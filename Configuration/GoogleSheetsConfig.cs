// CSharpApp/Configuration/GoogleSheetsConfig.cs
namespace CSharpApp.Configuration
{
    public class GoogleSheetsConfig
    {
        public required string ServiceAccountKeyPath { get; set; }
        public required string SpreadsheetId { get; set; } // Added this line
        // You can add other Sheets-related config here later, e.g., default range or cache duration
    }
}