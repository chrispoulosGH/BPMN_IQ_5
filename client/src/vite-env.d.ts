/// <reference types="vite/client" />

declare module 'bpmn-js/lib/Modeler' {
  const BpmnModeler: any;
  export default BpmnModeler;
}

declare module 'bpmn-js-properties-panel' {
  export const BpmnPropertiesPanelModule: any;
  export const BpmnPropertiesProviderModule: any;
}

declare module '*.css' {
  const content: string;
  export default content;
}
