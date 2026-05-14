import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from 'bpmn-js-properties-panel';

export const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="sample-diagram" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="Process_1" isExecutable="false">
    <bpmn2:startEvent id="StartEvent_1" />
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds height="36.0" width="36.0" x="412.0" y="240.0" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`;

export interface BpmnEditorHandle {
  getXml: () => Promise<string>;
  fitViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface BpmnEditorProps {
  xml: string;
  onXmlChange?: (xml: string) => void;
  showProperties?: boolean;
}

const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  ({ xml, onXmlChange, showProperties = true }, ref) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const propertiesRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const xmlRef = useRef<string>(xml);

    // Keep the latest xml in a ref to avoid stale closures
    xmlRef.current = xml;

    useImperativeHandle(ref, () => ({
      getXml: async () => {
        const { xml: out } = await modelerRef.current.saveXML({ format: true });
        return out;
      },
      fitViewport: () => {
        modelerRef.current?.get('canvas')?.zoom('fit-viewport');
      },
      zoomIn: () => {
        const canvas = modelerRef.current?.get('canvas');
        if (canvas) canvas.zoom(canvas.zoom() * 1.2);
      },
      zoomOut: () => {
        const canvas = modelerRef.current?.get('canvas');
        if (canvas) canvas.zoom(canvas.zoom() / 1.2);
      },
    }));

    // Initialize the modeler once
    useEffect(() => {
      if (!canvasRef.current) return;

      const modeler = new BpmnModeler({
        container: canvasRef.current,
        propertiesPanel: showProperties ? { parent: propertiesRef.current } : undefined,
        additionalModules: showProperties
          ? [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule]
          : [],
      });

      modelerRef.current = modeler;

      modeler.on('commandStack.changed', async () => {
        try {
          const { xml: updated } = await modeler.saveXML({ format: true });
          onXmlChange?.(updated);
        } catch {
          // ignore save errors during rapid edits
        }
      });

      return () => {
        modeler.destroy();
        modelerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Import XML when it changes from outside
    useEffect(() => {
      const modeler = modelerRef.current;
      if (!modeler) return;
      const source = xml || EMPTY_DIAGRAM;
      modeler.importXML(source).then(() => {
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
      }).catch((err: Error) => {
        console.error('[BpmnEditor] Import error:', err.message);
      });
    }, [xml]);

    return (
      <div className="flex h-full w-full overflow-hidden relative">
        <div ref={canvasRef} className="bpmn-canvas absolute inset-0" />
        {showProperties && (
          <div
            ref={propertiesRef}
            className="properties-panel-container w-[280px] min-w-[240px] border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-10"
          />
        )}
      </div>
    );
  },
);

BpmnEditor.displayName = 'BpmnEditor';
export default BpmnEditor;
