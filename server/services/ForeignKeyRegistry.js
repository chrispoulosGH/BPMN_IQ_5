/**
 * FK Registry - Maintains metadata about foreign key relationships across components
 * 
 * Purpose:
 * - Stores FK mapping rules: (targetGroup, targetScope) → collection metadata
 * - Tracks transform rules: FK_Column → fieldName conversions
 * - Enables resolver to know where to look for foreign data
 */

class ForeignKeyRegistry {
  constructor() {
    // Map: "{targetGroup}|{targetScope}" → FK metadata
    this.mappings = new Map();
    
    // Map: "{neighborhoodName}|{modelName}|{componentName}" → component FK definitions
    this.componentFKMetadata = new Map();
  }

  /**
   * Register a FK mapping when component is uploaded/created
   * @param {Object} fkColumn - FK column metadata from component
   * @param {string} neighborhoodName - Neighborhood the component belongs to
   * @param {string} modelName - Model the component belongs to
   * @param {string} componentName - Component name
   */
  registerForeignKey(fkColumn, { neighborhoodName, modelName, componentName }) {
    const { targetGroup, targetScope, targetColumnName, fieldName } = fkColumn;
    
    if (!targetGroup || !targetScope) {
      console.warn(`Skipping FK registration: incomplete target metadata`, fkColumn);
      return;
    }

    // Register the FK relationship target
    const registryKey = `${targetGroup}|${targetScope}`;
    if (!this.mappings.has(registryKey)) {
      this.mappings.set(registryKey, {
        targetGroup,
        targetScope,
        targetIdField: targetColumnName, // The field to match FK values against
        sourceReferences: [], // Components that reference this target
      });
    }

    // Track which components reference this target
    const mapping = this.mappings.get(registryKey);
    const sourceRef = `${neighborhoodName}|${modelName}|${componentName}`;
    if (!mapping.sourceReferences.includes(sourceRef)) {
      mapping.sourceReferences.push(sourceRef);
    }

    // Register component-level FK metadata
    const componentKey = `${neighborhoodName}|${modelName}|${componentName}`;
    if (!this.componentFKMetadata.has(componentKey)) {
      this.componentFKMetadata.set(componentKey, []);
    }
    
    const fkMetadata = this.componentFKMetadata.get(componentKey);
    fkMetadata.push({
      sourceColumnName: fkColumn.sourceColumnName, // Original CSV header
      fieldName: fkColumn.fieldName, // Normalized field name (e.g., fk_correlation_id)
      targetGroup,
      targetScope,
      targetIdField: targetColumnName,
      targetReference: fkColumn.targetReference, // Full reference string
    });
  }

  /**
   * Look up FK target metadata by targetGroup and targetScope
   * @param {string} targetGroup - The data group (sheet tab name)
   * @param {string} targetScope - The MongoDB collection name
   * @returns {Object|null} Target metadata or null if not found
   */
  lookupTarget(targetGroup, targetScope) {
    const registryKey = `${targetGroup}|${targetScope}`;
    return this.mappings.get(registryKey) || null;
  }

  /**
   * Get all FK definitions for a component
   * @param {string} neighborhoodName 
   * @param {string} modelName 
   * @param {string} componentName 
   * @returns {Array} FK metadata array
   */
  getComponentForeignKeys({ neighborhoodName, modelName, componentName }) {
    const componentKey = `${neighborhoodName}|${modelName}|${componentName}`;
    return this.componentFKMetadata.get(componentKey) || [];
  }

  /**
   * Get all registered FK targets (for admin/debug)
   * @returns {Array} Array of target metadata objects
   */
  getAllTargets() {
    return Array.from(this.mappings.values());
  }

  /**
   * Get all components that reference a specific target
   * @param {string} targetGroup 
   * @param {string} targetScope 
   * @returns {Array} Component identifiers
   */
  getSourceComponentsForTarget(targetGroup, targetScope) {
    const target = this.lookupTarget(targetGroup, targetScope);
    return target ? target.sourceReferences : [];
  }

  /**
   * Check if a target is registered
   * @param {string} targetGroup 
   * @param {string} targetScope 
   * @returns {boolean}
   */
  hasTarget(targetGroup, targetScope) {
    return this.mappings.has(`${targetGroup}|${targetScope}`);
  }

  /**
   * Clear registry (for testing/reset)
   */
  clear() {
    this.mappings.clear();
    this.componentFKMetadata.clear();
  }

  /**
   * Get registry stats (for debugging)
   * @returns {Object} Stats about registered mappings
   */
  getStats() {
    return {
      totalTargets: this.mappings.size,
      totalComponents: this.componentFKMetadata.size,
      targets: this.getAllTargets(),
    };
  }
}

// Singleton instance
const registry = new ForeignKeyRegistry();

module.exports = registry;
