import React, { useEffect, useRef, useState } from "react";
import SearchBox from "./SearchBox.jsx";

const api = window.resolveCommandCenter;

function App() {
  const searchRef = useRef(null);
  const [commands, setCommands] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    api.searchCommands("")
      .then((loadedCommands) => {
        if (isMounted) {
          setCommands(loadedCommands);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setStatus(error.message);
        }
      });

    const unsubscribe = api.onPaletteShown(() => {
      setQuery("");
      setSelectedIndex(0);
      setStatus("");
      setIsExecuting(false);
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    api.searchCommands(query)
      .then((matchedCommands) => {
        if (isMounted) {
          setCommands(matchedCommands);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setStatus(error.message);
        }
      });

    setSelectedIndex(0);
    return () => {
      isMounted = false;
    };
  }, [query]);

  async function executeCommand(command) {
    if (!command || isExecuting) {
      return;
    }

    setIsExecuting(true);
    setStatus("");

    try {
      await api.executeCommand(command.id);
    } catch (error) {
      setStatus(error.message);
      setIsExecuting(false);
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    }
  }

  async function executeSelectedCommand() {
    await executeCommand(commands[selectedIndex]);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      api.hidePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (commands.length === 0) {
        return;
      }
      setSelectedIndex((current) => Math.min(current + 1, commands.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (commands.length === 0) {
        return;
      }
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      executeSelectedCommand();
    }
  }

  return (
    <main className="palette-shell">
      <SearchBox
        ref={searchRef}
        value={query}
        onChange={setQuery}
        onKeyDown={handleKeyDown}
      />
      <ul className="command-list" role="listbox" aria-label="Commands">
        {commands.map((command, index) => (
          <li
            key={command.id}
            className={index === selectedIndex ? "command-item selected" : "command-item"}
            role="option"
            aria-selected={index === selectedIndex}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => executeCommand(command)}
          >
            <span className="command-name">{command.name}</span>
            <span className="command-id">{command.id}</span>
          </li>
        ))}
        {commands.length === 0 && (
          <li className="empty-state">No matching commands</li>
        )}
      </ul>
      {status && <div className="status" role="status">{status}</div>}
      {isExecuting && <div className="status" role="status">Running command</div>}
    </main>
  );
}

export default App;
