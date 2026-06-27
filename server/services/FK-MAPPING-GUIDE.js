/**
 * FK Mapping System - Implementation Guide & Examples
 * 
 * This guide demonstrates how the Foreign Key (FK) mapping system works
 * in practice and provides examples for common use cases.
 */

// =============================================================================
// SYSTEM ARCHITECTURE
// =============================================================================

/*
The FK Mapping system consists of three components:

1. ForeignKeyRegistry (server/services/ForeignKeyRegistry.js)
   - Maintains metadata about FK relationships
   - Maps (targetGroup, targetScope) pairs to collection info
   - Tracks which components reference which targets
   - Stateless query layer for registry lookups

2. ForeignKeyResolver (server/services/ForeignKeyResolver.js)
   - Performs actual database queries to resolve FK values
   - Validates FK values exist in target collections
   - Enriches component data with resolved references
   - Handles batch validation

3. API Endpoints (server/routes/customFactories.js)
   - REST interface for FK operations
   - Admin/debug endpoints for registry inspection
   - Validation and enrichment endpoints
*/

// =============================================================================
// NAMING CONVENTIONS
// =============================================================================

/*
CSV Column Header Format:
  FK_[targetGroup]([targetScope]).[targetColumnName]

Example: FK_Data[Applications].CORRELATION_ID
  ├─ FK_ prefix: Identifies as foreign key column
  ├─ Data: targetGroup (sheet tab where foreign data was loaded)
  ├─ Applications: targetScope (MongoDB collection name)
  └─ CORRELATION_ID: targetColumnName (the lookup field)

Normalized Field Name:
  Columns are normalized to: fk_[targetColumnName_normalized]
  
Example: FK_Data[Applications].CORRELATION_ID
  └─ fk_correlation_id (stored as field name in component rows)

Storage in MongoDB:
  Component document:
    {
      name: "Applications",          // component name
      neighborhoodName: "Data",      // the group it belongs to
      foreignKeyColumns: [           // metadata about FK columns
        {
          name: "FK_Data[Applications].CORRELATION_ID",
          sourceColumnName: "FK_Data[Applications].CORRELATION_ID",
          fieldName: "fk_correlation_id",
          targetReference: "Data[Applications].CORRELATION_ID",
          targetGroup: "Data",
          targetScope: "Applications",
          targetColumnName: "CORRELATION_ID"
        }
      ],
      rows: [                        // data rows
        {
          values: {
            name: "SAP System",
            fk_correlation_id: "APP-001"  // the actual FK value
          }
        }
      ]
    }
*/

// =============================================================================
// API ENDPOINTS
// =============================================================================

// 1. REGISTRY STATUS - View all registered FK mappings
/*
GET /api/custom-factories/fk-registry/status

Response:
{
  "success": true,
  "registry": {
    "totalTargets": 3,
    "totalComponents": 5,
    "targets": [
      {
        "targetGroup": "Data",
        "targetScope": "Applications",
        "targetIdField": "CORRELATION_ID",
        "sourceReferences": [
          "ATT Journey Model|MyModel|Applications"
        ]
      }
    ]
  }
}
*/

// 2. RESOLVE SINGLE FK VALUE
/*
POST /api/custom-factories/fk-resolve

Request Body:
{
  "targetGroup": "Data",
  "targetScope": "Applications",
  "targetIdField": "CORRELATION_ID",
  "fkValue": "APP-001"
}

Response (Success):
{
  "success": true,
  "fkValue": "APP-001",
  "target": {
    "targetGroup": "Data",
    "targetScope": "Applications",
    "targetIdField": "CORRELATION_ID"
  },
  "resolved": {
    "values": {
      "name": "SAP System",
      "correlation_id": "APP-001",
      "status": "Active"
    }
  }
}

Response (Not Found):
{
  "error": "FK value \"APP-001\" not found in Data/Applications",
  "fkValue": "APP-001",
  "target": {...}
}
*/

// 3. BATCH VALIDATE FK VALUES
/*
POST /api/custom-factories/fk-validate

Request Body:
{
  "validations": [
    {
      "targetGroup": "Data",
      "targetScope": "Applications",
      "targetIdField": "CORRELATION_ID",
      "fkValue": "APP-001"
    },
    {
      "targetGroup": "Data",
      "targetScope": "Applications",
      "targetIdField": "CORRELATION_ID",
      "fkValue": "APP-999"
    }
  ]
}

Response:
{
  "success": false,
  "allValid": false,
  "validatedCount": 2,
  "invalidCount": 1,
  "results": [
    {
      "fkValue": "APP-001",
      "target": {...},
      "exists": true
    },
    {
      "fkValue": "APP-999",
      "target": {...},
      "exists": false
    }
  ],
  "invalidResults": [
    {
      "fkValue": "APP-999",
      "target": {...},
      "exists": false
    }
  ]
}
*/

// 4. GET COMPONENT WITH RESOLVED FK DATA
/*
GET /api/custom-factories/components/{componentId}/fk-enriched

Response:
{
  "success": true,
  "component": {
    "name": "Applications",
    "rows": [
      {
        "values": {
          "name": "SAP System",
          "fk_correlation_id": "APP-001"
        },
        "_fkResolved": {
          "fk_correlation_id": {
            "fkValue": "APP-001",
            "resolved": {
              "values": {
                "name": "SAP System",
                "correlation_id": "APP-001",
                "status": "Active"
              }
            },
            "targetReference": "Data[Applications].CORRELATION_ID"
          }
        }
      }
    ]
  }
}
*/

// 5. GET COMPONENTS REFERENCED BY FK COLUMNS
/*
GET /api/custom-factories/components/{componentId}/fk-references

Response:
{
  "success": true,
  "componentName": "Applications",
  "referencedComponentsCount": 2,
  "referencedComponents": [
    {
      "fieldName": "fk_correlation_id",
      "targetGroup": "Data",
      "targetScope": "Applications",
      "targetComponentId": "507f1f77bcf86cd799439011",
      "targetComponentName": "Applications",
      "targetComponentRowCount": 150
    },
    {
      "fieldName": "fk_product_id",
      "targetGroup": "Data",
      "targetScope": "Products",
      "targetComponentId": "507f1f77bcf86cd799439012",
      "targetComponentName": "Products",
      "targetComponentRowCount": 45
    }
  ]
}
*/

// 6. VALIDATE ALL FK VALUES IN A COMPONENT
/*
POST /api/custom-factories/components/{componentId}/fk-validate

Response (All Valid):
{
  "success": true,
  "componentName": "Applications",
  "valid": true,
  "errorCount": 0,
  "errors": []
}

Response (With Errors):
{
  "success": false,
  "componentName": "Applications",
  "valid": false,
  "errorCount": 2,
  "errors": [
    {
      "rowPrimaryKey": "MyApp1",
      "errors": [
        {
          "fieldName": "fk_correlation_id",
          "fkValue": "INVALID-ID",
          "targetGroup": "Data",
          "targetScope": "Applications",
          "targetIdField": "CORRELATION_ID",
          "message": "FK value \"INVALID-ID\" not found in Data/Applications.CORRELATION_ID"
        }
      ]
    }
  ]
}
*/

// 7. LIST ALL REGISTERED FK TARGETS
/*
GET /api/custom-factories/fk-registry/targets

Response:
{
  "success": true,
  "targetCount": 3,
  "targets": [
    {
      "targetGroup": "Data",
      "targetScope": "Applications",
      "targetIdField": "CORRELATION_ID",
      "sourceReferences": [
        "ATT Journey Model|MyModel|Applications",
        "ATT Journey Model|MyModel|BusinessFlow"
      ]
    },
    {
      "targetGroup": "Data",
      "targetScope": "Products",
      "targetIdField": "PRODUCT_ID",
      "sourceReferences": [
        "ATT Journey Model|MyModel|Applications"
      ]
    }
  ]
}
*/

// 8. GET COMPONENTS THAT REFERENCE A TARGET
/*
GET /api/custom-factories/fk-registry/targets/{targetGroup}/{targetScope}/sources

Example:
GET /api/custom-factories/fk-registry/targets/Data/Applications/sources

Response:
{
  "success": true,
  "targetGroup": "Data",
  "targetScope": "Applications",
  "sourceComponentCount": 2,
  "sourceComponents": [
    "ATT Journey Model|MyModel|Applications",
    "ATT Journey Model|MyModel|BusinessFlow"
  ]
}
*/

// =============================================================================
// WORKFLOW: Upload Component File with FK Columns
// =============================================================================

/*
1. User prepares spreadsheet with FK columns:
   
   | Application Component | Product Component | FK_Data[Products].PRODUCT_ID |
   |---|---|---|
   | SAP System | Finance | PROD-001 |
   | Oracle EBS | HR | PROD-002 |

2. Upload endpoint receives file and:
   - Parses FK column headers
   - Extracts FK metadata (targetGroup, targetScope, targetColumnName)
   - Normalizes field names (FK_Data[Products].PRODUCT_ID → fk_product_id)
   - Stores FK values in component rows
   - Registers FK columns in the registry

3. Registry registration occurs:
   - Component "Products" (in "Data" group) is registered as target
   - "Applications" component (in model) is marked as source
   - FK relationship metadata is stored in memory

4. Optional: Validate FK values
   - Can validate during upload (currently skipped - can be enabled)
   - Can validate after upload using /fk-validate endpoint
   - Can validate entire component using /components/{id}/fk-validate

5. Query phase - Resolve FK references:
   - GET /components/{appId}/fk-enriched - Get app with resolved product data
   - POST /fk-resolve - Look up specific FK value
   - GET /components/{appId}/fk-references - See what targets are referenced
*/

// =============================================================================
// SPREADSHEET REQUIREMENTS
// =============================================================================

/*
For FK columns to work correctly, spreadsheets must follow conventions:

Tab Names (targetGroup):
  - Must be consistent across related files
  - Used as "Data" group namespace
  - Example: "Data", not "Data1" or "Source_Data"

Collection Names (targetScope):
  - Must match MongoDB collection names
  - Must match the component name in the Data group
  - Example: "Applications" (not "Application" or "APPLICATIONS")

Column Names (targetColumnName):
  - Must be the actual identifier field in the target collection
  - Should match how data is stored
  - Example: "CORRELATION_ID" (exact case/format as in data)

FK Column Headers:
  - Must follow format: FK_[group]([collection]).[field]
  - Example: FK_Data[Applications].CORRELATION_ID
  - No spaces around brackets or dots
  - Case-sensitive for collection and field names

Consistency:
  - All related spreadsheets must use same group name: "Data"
  - Collection names must match across files
  - Field names must match the actual column names in source data
*/

// =============================================================================
// COMMON TASKS
// =============================================================================

// Task: Check if all FK values in a component are valid
async function validateComponentFKs(componentId) {
  const response = await fetch(
    `/api/custom-factories/components/${componentId}/fk-validate`,
    { method: 'POST' }
  );
  const result = await response.json();
  if (!result.valid) {
    console.error('FK Validation errors:', result.errors);
  }
  return result;
}

// Task: Get resolved data for a component
async function getComponentWithResolvedFKs(componentId) {
  const response = await fetch(
    `/api/custom-factories/components/${componentId}/fk-enriched`
  );
  const result = await response.json();
  // result.component.rows[0]._fkResolved contains resolved data
  return result.component;
}

// Task: Find what components reference a specific target
async function findSourcesForTarget(targetGroup, targetScope) {
  const response = await fetch(
    `/api/custom-factories/fk-registry/targets/${targetGroup}/${targetScope}/sources`
  );
  const result = await response.json();
  return result.sourceComponents;
}

// Task: Resolve a single FK value
async function resolveFKValue(targetGroup, targetScope, targetIdField, fkValue) {
  const response = await fetch(
    '/api/custom-factories/fk-resolve',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetGroup,
        targetScope,
        targetIdField,
        fkValue
      })
    }
  );
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.resolved;
}

// =============================================================================
// TROUBLESHOOTING
// =============================================================================

/*
Issue: "FK value not found" error
- Check that targetGroup matches the Data sheet name
- Check that targetScope matches the collection name exactly
- Check that targetIdField matches the column name in data
- Verify FK value exists in the target component's rows

Issue: FK columns not being recognized
- Check column header format: FK_[group]([scope]).[field]
- No extra spaces around brackets/dots
- Ensure it's a component column (has "Component" suffix)
- Verify it comes after the component header it belongs to

Issue: FK Registry shows no targets
- Upload a component file first (registry populates on upload)
- Check that foreignKeyColumns is populated in component metadata
- Verify target components exist with matching names

Issue: FK value exists but resolver can't find it
- Check that target component rows have the value
- Verify case sensitivity matches between FK value and target field
- Check primary key normalization (values should be normalized)
- Ensure target component is in the expected group/collection
*/
