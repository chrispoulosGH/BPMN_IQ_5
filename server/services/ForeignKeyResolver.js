/**
 * FK Resolver - Performs actual lookups of FK values to target records
 * 
 * Purpose:
 * - Resolves FK values to actual records in target collections
 * - Validates FK values exist (for upload validation)
 * - Enriches component data with resolved FK references
 */

const Component = require('../models/Component');
const fkRegistry = require('./ForeignKeyRegistry');

class ForeignKeyResolver {
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Resolve a single FK value to its target record
   * @param {Object} fkMetadata - FK column metadata { targetGroup, targetScope, targetIdField, fieldName }
   * @param {string} fkValue - The actual FK value to resolve
   * @returns {Promise<Object|null>} The resolved target record or null if not found
   */
  async resolveForeignKey(fkMetadata, fkValue) {
    if (!fkValue) {
      return null;
    }

    const { targetGroup, targetScope, targetIdField } = fkMetadata;

    try {
      // Look up the target component that has the matching ID
      const targetComponent = await Component.findOne({
        neighborhoodName: targetGroup,
        name: targetScope,
      });

      if (!targetComponent) {
        console.warn(
          `FK Resolution: Target component not found [${targetGroup}/${targetScope}]`,
          fkMetadata
        );
        return null;
      }

      // Search within that component's rows for a matching ID
      const matchingRow = targetComponent.rows.find((row) => {
        // The row stores values in a Map - need to handle both Map and object forms
        const primaryKey = row.values?.get ? row.values.get('_id') : row.values?._id;
        const idFieldValue = row.values?.get
          ? row.values.get(targetIdField)
          : row.values?.[targetIdField];

        // Match against both primary key and the specific target field
        return primaryKey === fkValue || idFieldValue === fkValue;
      });

      if (!matchingRow) {
        console.warn(
          `FK Resolution: No matching record found [${targetGroup}/${targetScope}] for value: ${fkValue}`,
          { targetIdField, fkMetadata }
        );
        return null;
      }

      // Return the resolved record as a plain object
      return this._rowToObject(matchingRow);
    } catch (error) {
      console.error(
        `FK Resolution Error [${targetGroup}/${targetScope}]:`,
        error.message,
        { fkMetadata, fkValue }
      );
      return null;
    }
  }

  /**
   * Validate that a FK value exists in the target collection (for upload validation)
   * @param {Object} fkMetadata - FK column metadata
   * @param {string} fkValue - The FK value to validate
   * @param {Object} options - { throwOnMissing: boolean }
   * @returns {Promise<boolean>} True if FK value exists
   */
  async validateForeignKeyExists(fkMetadata, fkValue, options = {}) {
    const { throwOnMissing = false } = options;

    const resolved = await this.resolveForeignKey(fkMetadata, fkValue);
    const exists = resolved !== null;

    if (!exists && throwOnMissing) {
      const { targetGroup, targetScope, targetIdField } = fkMetadata;
      throw new Error(
        `FK Validation Failed: Value "${fkValue}" not found in ${targetGroup}/${targetScope}.${targetIdField}`
      );
    }

    return exists;
  }

  /**
   * Validate all FK values in a component row
   * @param {Object} componentFKDefinitions - Array of FK metadata from component
   * @param {Object} rowValues - The row values Map to validate
   * @param {Object} options - { throwOnMissing: boolean }
   * @returns {Promise<Object>} { valid: boolean, errors: [] }
   */
  async validateRowForeignKeys(componentFKDefinitions, rowValues, options = {}) {
    const errors = [];

    for (const fkDef of componentFKDefinitions || []) {
      const fkValue = rowValues?.get ? rowValues.get(fkDef.fieldName) : rowValues?.[fkDef.fieldName];

      if (!fkValue) {
        // Empty FK values are allowed (optional references)
        continue;
      }

      const exists = await this.validateForeignKeyExists(fkDef, fkValue, {
        throwOnMissing: false,
      });

      if (!exists) {
        errors.push({
          fieldName: fkDef.fieldName,
          fkValue,
          targetGroup: fkDef.targetGroup,
          targetScope: fkDef.targetScope,
          targetIdField: fkDef.targetIdField,
          message: `FK value "${fkValue}" not found in ${fkDef.targetGroup}/${fkDef.targetScope}.${fkDef.targetIdField}`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Enrich a component row with resolved FK data
   * @param {Object} row - Component row with values
   * @param {Array} fkDefinitions - FK metadata definitions for component
   * @returns {Promise<Object>} Row with added _fkResolved object
   */
  async enrichRowWithResolvedForeignKeys(row, fkDefinitions) {
    const enriched = { ...row };
    enriched._fkResolved = {};

    for (const fkDef of fkDefinitions || []) {
      const fkValue = row.values?.get ? row.values.get(fkDef.fieldName) : row.values?.[fkDef.fieldName];

      if (!fkValue) {
        continue;
      }

      try {
        const resolved = await this.resolveForeignKey(fkDef, fkValue);
        if (resolved) {
          enriched._fkResolved[fkDef.fieldName] = {
            fkValue,
            resolved,
            targetReference: fkDef.targetReference,
          };
        }
      } catch (error) {
        console.error(`Failed to resolve FK [${fkDef.fieldName}]:`, error.message);
      }
    }

    return enriched;
  }

  /**
   * Enrich a component with resolved FK data for all its rows
   * @param {Object} component - Component document
   * @returns {Promise<Object>} Component with _fkResolved data added to rows
   */
  async enrichComponentWithResolvedForeignKeys(component) {
    const enriched = JSON.parse(JSON.stringify(component.toObject?.() || component));
    
    const fkDefinitions = this.registry.getComponentForeignKeys({
      neighborhoodName: component.neighborhoodName,
      modelName: component.modelName,
      componentName: component.name,
    });

    if (!fkDefinitions || fkDefinitions.length === 0) {
      return enriched;
    }

    enriched.rows = await Promise.all(
      (enriched.rows || []).map((row) => this.enrichRowWithResolvedForeignKeys(row, fkDefinitions))
    );

    return enriched;
  }

  /**
   * Get all components that a component references via FK
   * @param {Object} component - Component with FK columns
   * @returns {Array<Object>} Array of { fieldName, targetComponent, targetGroup, targetScope }
   */
  async getReferencedComponents(component) {
    const fkDefinitions = this.registry.getComponentForeignKeys({
      neighborhoodName: component.neighborhoodName,
      modelName: component.modelName,
      componentName: component.name,
    });

    const referenced = [];

    for (const fkDef of fkDefinitions || []) {
      const targetComponent = await Component.findOne({
        neighborhoodName: fkDef.targetGroup,
        name: fkDef.targetScope,
      });

      if (targetComponent) {
        referenced.push({
          fieldName: fkDef.fieldName,
          targetComponent,
          targetGroup: fkDef.targetGroup,
          targetScope: fkDef.targetScope,
        });
      }
    }

    return referenced;
  }

  /**
   * Validate all FKs in a component (for upload validation)
   * @param {Object} component - Component to validate
   * @returns {Promise<Object>} { valid: boolean, errors: [] }
   */
  async validateComponentForeignKeys(component) {
    const allErrors = [];

    const fkDefinitions = this.registry.getComponentForeignKeys({
      neighborhoodName: component.neighborhoodName,
      modelName: component.modelName,
      componentName: component.name,
    });

    for (const row of component.rows || []) {
      const validation = await this.validateRowForeignKeys(fkDefinitions, row.values, {
        throwOnMissing: false,
      });

      if (!validation.valid) {
        allErrors.push({
          rowPrimaryKey: row.values?.get ? row.values.get('_id') : row.values?._id,
          errors: validation.errors,
        });
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  /**
   * Convert a row object (with Map values) to plain object
   * @private
   */
  _rowToObject(row) {
    const result = {};

    // Copy regular properties
    Object.keys(row).forEach((key) => {
      if (key !== 'values') {
        result[key] = row[key];
      }
    });

    // Convert Map values to object
    if (row.values) {
      result.values = {};
      if (row.values instanceof Map) {
        row.values.forEach((value, key) => {
          result.values[key] = value;
        });
      } else {
        result.values = row.values;
      }
    }

    return result;
  }
}

// Create singleton resolver
const resolver = new ForeignKeyResolver(fkRegistry);

module.exports = resolver;
