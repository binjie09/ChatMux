import { Download, Trash2 } from "lucide-react";
import { type FileTreeContextMenuState } from "./file-tree-types";

type FileTreeContextMenuProps = {
  menu: FileTreeContextMenuState | null;
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
};

export function FileTreeContextMenu(props: FileTreeContextMenuProps) {
  if (!props.menu) {
    return null;
  }
  return (
    <>
      <button className="file-tree-menu-scrim" type="button" aria-label="Close file menu" onClick={props.onClose} />
      <div className="file-tree-context-menu" style={{ left: props.menu.x, top: props.menu.y }} role="menu">
        <button type="button" role="menuitem" onClick={props.onDownload}>
          <Download size={15} aria-hidden="true" />
          Download
        </button>
        <button className="danger" type="button" role="menuitem" onClick={props.onDelete}>
          <Trash2 size={15} aria-hidden="true" />
          Delete
        </button>
      </div>
    </>
  );
}
