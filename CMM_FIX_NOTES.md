# CMM Search and Tree Fix Summary

## Root Cause
CMM components use `Application_Name` as the leaf component name, but the frontend hardcoded queries for `Application`. This caused:
- Tree view to return 0 results (querying for wrong component name)
- Search to potentially return fewer results if filtered by component name

## Fix Applied

### 1. Server: Added new endpoint to get leaf component name
**File**: `server/routes/customFactories.js`
- Added `GET /api/custom-factories/leaf-component` endpoint
- Returns the actual leaf component name for a given neighborhood
- Examines component hierarchy to find which component has no children

### 2. Client: Updated API to call new endpoint
**File**: `client/src/api.ts`
- Added `getLeafComponent()` function
- Calls new server endpoint with neighborhood name

### 3. Client: Updated ComponentsViewer to use dynamic leaf component
**File**: `client/src/components/ComponentsViewer.tsx`
- Imported `getLeafComponent` function
- Modified hierarchy loading to:
  1. First fetch the leaf component name
  2. Then query for hierarchies using that component name
  3. Added debug logging

## Component Names by Model
- AT&T Journey: `Application`
- LBGUPS: `Application`
- CMM: `Application_Name`

## What This Fixes
- ✅ ComponentsViewer tree now shows CMM data
- ✅ Model-wide component search now works consistently across all models
- ✅ Future models with different component naming will work automatically

## No Changes Needed For Search
Search functionality was already dynamic - it queries the ComponentSearchIndex without hardcoding component names.
