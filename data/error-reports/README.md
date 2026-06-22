# Component Upload Error Reports

This directory contains automatically generated error reports from failed component uploads.

## Format

Each error report is saved as an Excel file with the naming pattern:
```
validation-errors-{MODEL_NAME}-{TIMESTAMP}-{SOURCE_FILE}.xlsx
```

## Columns

- **Row Number**: The row in the uploaded spreadsheet that failed validation
- **Match Score**: How many columns matched the closest model row (out of total matched columns)
- **[Column Name] (Uploaded)**: The value from the uploaded file
- **[Column Name] (Model)**: The closest matching value from the model catalog

## Usage

When a component upload fails validation:
1. The error report is automatically saved to this directory
2. The API response includes the filename and relative path
3. Download the file to see detailed information about which rows failed and why

## Cleanup

Error reports can be deleted manually or via a maintenance script. They do not affect the application's functionality.
