import { useState } from 'react';
import type { InspectorSnapshot, MessageEvent } from '../../types';
import { formatTime } from '../../lib/time';
import styles from './InspectorDrawer.module.css';

interface InspectorDrawerProps {
  open: boolean;
  snapshots: InspectorSnapshot[];
  activeSnapshotId: string | null;
  onSelectSnapshot: (id: string) => void;
  messages: MessageEvent[];
  onClose: () => void;
}

export const InspectorDrawer = ({
  open,
  snapshots,
  activeSnapshotId,
  onSelectSnapshot,
  messages,
  onClose,
}: InspectorDrawerProps) => {
  if (!open) return null;

  const orderedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const activeSnapshot =
    orderedSnapshots.find((snapshot) => snapshot.id === activeSnapshotId) ||
    orderedSnapshots[orderedSnapshots.length - 1];

  return (
    <div className={`${styles.inspectorDrawer} ${open ? styles.open : ''}`}>
      <div className={styles.drawerHeader}>
        <div>
          <h3>Prompt Inspector</h3>
          <span className={styles.badge}>Transparency Log</span>
        </div>
        <button className={styles.drawerClose} onClick={onClose} type="button">
          Close
        </button>
      </div>

      {orderedSnapshots.length === 0 ? (
        <p>
          No context snapshots yet. They will appear once the moderator prepares the first
          prompt.
        </p>
      ) : (
        <div className={styles.drawerContent}>
          <div className={styles.snapshotSelector}>
            {orderedSnapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                className={`${styles.pill} ${snapshot.id === activeSnapshot?.id ? styles.active : ''}`}
                onClick={() => onSelectSnapshot(snapshot.id)}
                type="button"
              >
                Round {snapshot.round} → {snapshot.audience}
              </button>
            ))}
          </div>

          {activeSnapshot && (
            <SnapshotDetails snapshot={activeSnapshot} messages={messages} />
          )}
        </div>
      )}
    </div>
  );
};

interface SnapshotDetailsProps {
  snapshot: InspectorSnapshot;
  messages: MessageEvent[];
}

const SnapshotDetails = ({ snapshot, messages }: SnapshotDetailsProps) => {
  const recordedAt = new Date(snapshot.timestamp).toLocaleString();
  const messageMap = new Map(messages.map((message) => [message.id, message]));
  const missing = snapshot.contextMessages.filter((entry) => !messageMap.has(entry.id));
  const latestExchange = snapshot.callPayload?.latest ?? null;

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className={styles.promptMeta}>
        <div>
          <strong>Context ID</strong> {snapshot.contextId}
        </div>
        <div>
          <strong>Audience</strong> {snapshot.audience}
        </div>
        <div>
          <strong>Round</strong> {snapshot.round}
        </div>
        <div>
          <strong>Recorded</strong> {recordedAt}
        </div>
        <div>
          <strong>User Prompt</strong> {snapshot.userPrompt}
        </div>
        {latestExchange && (
          <div>
            <strong>Latest Exchange</strong> {latestExchange}
          </div>
        )}
      </div>

      <div className={styles.toggleBar}>
        <span className={styles.pill}>
          {missing.length === 0
            ? 'Context mirror in sync'
            : `Pending ${missing.length} message${missing.length === 1 ? '' : 's'} from stream`}
        </span>
      </div>

      <div className={styles.inspectorActions}>
        <button
          className={styles.ghostButton}
          onClick={() =>
            downloadText(snapshot.prompt.rendered, `${snapshot.id}_prompt.txt`)
          }
          type="button"
        >
          Download prompt
        </button>
        <button
          className={`${styles.ghostButton} ${styles.secondary}`}
          onClick={() =>
            downloadText(snapshot.prompt.templateSkeleton, `${snapshot.id}_template.txt`)
          }
          type="button"
        >
          Download template
        </button>
      </div>

      <div>
        <strong>Instantiated Prompt</strong>
        <XMLViewer xml={snapshot.prompt.rendered} />
      </div>

      {snapshot.callPayload && (
        <details className={styles.insight}>
          <summary>Call payload</summary>
          <pre className={styles.codeBlock}>
            {JSON.stringify(snapshot.callPayload, null, 2)}
          </pre>
        </details>
      )}

      <AgentLens snapshot={snapshot} messages={messages} />
    </>
  );
};

interface AgentLensProps {
  snapshot: InspectorSnapshot;
  messages: MessageEvent[];
}

const AgentLens = ({ snapshot, messages }: AgentLensProps) => {
  const messageMap = new Map(messages.map((message) => [message.id, message]));
  const pending = snapshot.contextMessages.filter((entry) => !messageMap.has(entry.id));

  return (
    <section>
      <strong>Agent Lens</strong>
      <div className={styles.toggleBar} style={{ margin: '6px 0' }}>
        <span className={styles.pill}>
          {pending.length === 0
            ? 'Mirror matches stream'
            : `Waiting on ${pending.length} transcript update${pending.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <ul className={styles.agentContextList}>
        {snapshot.contextMessages.length === 0 && (
          <li>
            <div>No prior statements; the agent only receives the user prompt.</div>
          </li>
        )}
        {snapshot.contextMessages.map((entry) => (
          <li key={entry.id}>
            <div className={styles.meta}>
              {entry.speaker} · {formatTime(entry.timestamp)}
            </div>
            <div>{entry.surface}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};

interface XMLViewerProps {
  xml: string;
}

const XMLViewer = ({ xml }: XMLViewerProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSection = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Parse XML into a tree structure
  const parseXML = (xmlString: string) => {
    const tagRegex = /<(\/?)([\w-]+)([^>]*)>/g;
    const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

    const nodes: Array<{
      type: 'open' | 'close' | 'text' | 'cdata';
      tag?: string;
      attrs?: string;
      content?: string;
      indent: number;
    }> = [];

    let lastIndex = 0;
    let match;
    let depth = 0;

    // Replace CDATA sections temporarily
    const cdataPlaceholders: string[] = [];
    const xmlWithoutCDATA = xmlString.replace(cdataRegex, (_, content) => {
      const placeholder = `__CDATA_${cdataPlaceholders.length}__`;
      cdataPlaceholders.push(content);
      return placeholder;
    });

    while ((match = tagRegex.exec(xmlWithoutCDATA)) !== null) {
      // Get text before this tag
      if (match.index > lastIndex) {
        const text = xmlWithoutCDATA.slice(lastIndex, match.index).trim();
        if (text) {
          // Check if this is a CDATA placeholder
          const cdataMatch = text.match(/__CDATA_(\d+)__/);
          if (cdataMatch && cdataMatch[1]) {
            const index = parseInt(cdataMatch[1], 10);
            const cdataContent = cdataPlaceholders[index];
            if (cdataContent !== undefined) {
              nodes.push({ type: 'cdata', content: cdataContent, indent: depth });
            }
          } else {
            nodes.push({ type: 'text', content: text, indent: depth });
          }
        }
      }

      const [, closingSlash, tagName, attrs] = match;
      if (!tagName) continue;

      if (closingSlash) {
        // Closing tag
        depth--;
        nodes.push({ type: 'close', tag: tagName, indent: depth });
      } else {
        // Opening tag
        nodes.push({ type: 'open', tag: tagName, attrs: attrs?.trim() || '', indent: depth });
        depth++;
      }

      lastIndex = match.index + match[0].length;
    }

    return nodes;
  };

  const nodes = parseXML(xml);
  let nodeIndex = 0;

  const renderNode = (path: string = ''): React.JSX.Element[] => {
    const elements: React.JSX.Element[] = [];

    while (nodeIndex < nodes.length) {
      const node = nodes[nodeIndex];
      if (!node) break;

      if (node.type === 'close') {
        nodeIndex++;
        return elements;
      }

      if (node.type === 'open' && node.tag) {
        const currentPath = `${path}/${node.tag}`;
        const isExpanded = expanded.has(currentPath);
        nodeIndex++;

        // Find matching close tag
        let depth = 1;
        let closeIndex = nodeIndex;
        while (closeIndex < nodes.length && depth > 0) {
          const closeNode = nodes[closeIndex];
          if (!closeNode) break;
          if (closeNode.type === 'open') depth++;
          if (closeNode.type === 'close') depth--;
          closeIndex++;
        }

        const hasChildren = closeIndex - nodeIndex > 1;

        elements.push(
          <div
            key={currentPath}
            className={styles.xmlNode}
            style={{ marginLeft: `${node.indent * 16}px` }}
          >
            <div className={styles.xmlTagLine}>
              {hasChildren && (
                <button
                  className={styles.xmlToggle}
                  onClick={() => toggleSection(currentPath)}
                  type="button"
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              )}
              <span className={styles.xmlTagOpen}>
                {'<'}
                <span className={styles.xmlTagName}>{node.tag}</span>
                {node.attrs && <span className={styles.xmlAttrs}> {node.attrs}</span>}
                {'>'}
              </span>
            </div>

            {isExpanded && hasChildren && (
              <div className={styles.xmlChildren}>{renderNode(currentPath)}</div>
            )}

            {!isExpanded && hasChildren && <span className={styles.xmlCollapsed}>...</span>}

            <div className={styles.xmlTagLine} style={{ marginLeft: `${node.indent * 16}px` }}>
              <span className={styles.xmlTagClose}>
                {'</'}
                <span className={styles.xmlTagName}>{node.tag}</span>
                {'>'}
              </span>
            </div>
          </div>,
        );

        if (!isExpanded) {
          // Skip to closing tag
          nodeIndex = closeIndex;
        }
      } else if (node.type === 'text' && node.content) {
        elements.push(
          <div
            key={`text-${nodeIndex}`}
            className={styles.xmlText}
            style={{ marginLeft: `${(node.indent + 1) * 16}px` }}
          >
            {node.content}
          </div>,
        );
        nodeIndex++;
      } else if (node.type === 'cdata' && node.content) {
        elements.push(
          <details
            key={`cdata-${nodeIndex}`}
            className={styles.xmlCdata}
            style={{ marginLeft: `${(node.indent + 1) * 16}px` }}
          >
            <summary>CDATA Content</summary>
            <pre>{node.content}</pre>
          </details>,
        );
        nodeIndex++;
      } else {
        nodeIndex++;
      }
    }

    return elements;
  };

  return (
    <div className={styles.xmlViewer}>
      <div className={styles.xmlControls}>
        <button
          className={styles.xmlControlButton}
          onClick={() => {
            const openNodes = nodes.filter((n) => n.type === 'open' && n.tag);
            setExpanded(
              new Set(openNodes.map((n) => `/${n.tag}`).filter((path): path is string => Boolean(path))),
            );
          }}
          type="button"
        >
          Expand All
        </button>
        <button
          className={styles.xmlControlButton}
          onClick={() => setExpanded(new Set())}
          type="button"
        >
          Collapse All
        </button>
      </div>
      <div className={styles.xmlContent}>{renderNode()}</div>
    </div>
  );
};
