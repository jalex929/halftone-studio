import { useRef, useState } from "react";
import { readSettingsFromFile } from "../engine/embed";
import { sanitizeRibbon, type RibbonSettings } from "../engine/ribbon";

const SHELF_KEY = "halftone-studio:saved";

interface Saved {
  id: string;
  name: string;
  savedAt: string;
  settings: RibbonSettings;
}

function readShelf(): Saved[] {
  try {
    const raw = localStorage.getItem(SHELF_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((x): x is Saved => typeof x?.id === "string" && typeof x?.name === "string")
      .map((x) => ({ ...x, settings: sanitizeRibbon(x.settings) }));
  } catch {
    return [];
  }
}

function writeShelf(list: Saved[]): boolean {
  try {
    localStorage.setItem(SHELF_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "halftone";

interface Props {
  settings: RibbonSettings;
  onOpen: (s: RibbonSettings) => void;
  onStatus: (msg: string) => void;
  download: (name: string, blob: Blob) => void;
}

/** Named saves kept in this browser, plus a settings file to keep anywhere. */
export function SavedDesigns({ settings, onOpen, onStatus, download }: Props) {
  const [shelf, setShelf] = useState<Saved[]>(readShelf);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const label = name.trim() || `Design ${shelf.length + 1}`;
    const existing = shelf.find((x) => x.name === label);
    const entry: Saved = {
      id: existing?.id ?? `d${Date.now().toString(36)}`,
      name: label,
      savedAt: new Date().toISOString(),
      settings,
    };
    const next = [entry, ...shelf.filter((x) => x.id !== entry.id)];
    if (writeShelf(next)) {
      setShelf(next);
      setName("");
      onStatus(`Saved "${label}" in this browser.`);
    } else {
      onStatus("Couldn't save in this browser. Use Save file instead.");
    }
  };

  const remove = (id: string) => {
    const next = shelf.filter((x) => x.id !== id);
    writeShelf(next);
    setShelf(next);
  };

  const saveFile = () => {
    const label = name.trim() || "halftone";
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    download(`${slug(label)}.halftone.json`, blob);
    onStatus("Settings file downloaded. Open it here any time.");
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = readSettingsFromFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!json) throw new Error("no settings");
      onOpen(sanitizeRibbon(JSON.parse(json)));
      onStatus(`Opened ${file.name}.`);
    } catch {
      onStatus("That file wasn't made in Halftone Studio, so there's nothing to reopen.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="group">
      <h2>Save</h2>
      <label className="num wide">
        <span>Name</span>
        <input
          value={name}
          placeholder={`Design ${shelf.length + 1}`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </label>
      <div className="row-buttons">
        <button type="button" className="primary" onClick={save}>
          Save
        </button>
        <button type="button" onClick={saveFile}>
          Save file
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Open file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,.png,.json,image/svg+xml,image/png,application/json"
          hidden
          onChange={(e) => openFile(e.target.files?.[0])}
        />
      </div>
      {shelf.length > 0 ? (
        <ul className="shelf">
          {shelf.map((x) => (
            <li key={x.id}>
              <button type="button" className="shelf-open" onClick={() => onOpen(x.settings)}>
                <span>{x.name}</span>
                <small>{new Date(x.savedAt).toLocaleString()}</small>
              </button>
              <button type="button" aria-label={`Delete ${x.name}`} onClick={() => remove(x.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          Save keeps designs in this browser. Open file takes a saved file or any SVG or PNG you
          exported here, and brings the design back to edit.
        </p>
      )}
    </section>
  );
}
