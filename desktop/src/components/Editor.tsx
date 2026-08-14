import { useRef } from "react";
import MonacoEditor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/cpp/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import type { editor, Position } from "monaco-editor";

// Ship Monaco with the desktop app instead of downloading it from a CDN.
// This prevents an empty editor on offline/restricted Windows installations.
(window as any).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
loader.config({ monaco });

interface EditorProps {
  code: string;
  onChange: (value: string) => void;
  language?: string;
  /** Stable per-tab path so Monaco giữ model/undo history riêng cho từng tab. */
  path?: string;
  fontSize?: number;
  minimap?: boolean;
  onCursorChange?: (line: number, col: number) => void;
  onMountRef?: (editor: any) => void;
}

export default function Editor({ code, onChange, language = "cpp", path, fontSize = 14, minimap = true, onCursorChange, onMountRef }: EditorProps) {
  const editorRef = useRef<any>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    onMountRef?.(editor);

    // Report cursor position for the status bar
    editor.onDidChangeCursorPosition((e: any) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    // Monaco's built-in C++ mode does not expose a `languages.cpp.setDefaults`
    // API. Calling it throws during editor mount on production WebView2 builds.
    // Register our completions through the stable language API instead.

    // Add snippets
    monaco.languages.registerCompletionItemProvider("cpp", {
      provideCompletionItems: (model: editor.ITextModel, position: Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: [
            {
              label: "fors",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "for (int ${1:i} = ${2:0}; ${1:i} < ${3:n}; ${1:i}++) {\n\t$0\n}",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "For loop",
              range,
            },
            {
              label: "fastio",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "ios_base::sync_with_stdio(false);\ncin.tie(0); cout.tie(0);",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Fast I/O",
              range,
            },
            {
              label: "bits",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "#include <bits/stdc++.h>\nusing namespace std;\n",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Bits header",
              range,
            },
            {
              label: "solve",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "void solve() {\n\t$0\n}\n\nint main() {\n\tios_base::sync_with_stdio(false);\n\tcin.tie(0);\n\tint t; cin >> t;\n\twhile (t--) solve();\n\treturn 0;\n}",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Solve template with test cases",
              range,
            },
          ],
        };
      },
    });

    // Monaco's basic-languages KHÔNG kèm formatter cho C/C++ — nếu không đăng ký
    // thì "Format Document" (menu chuột phải / menu Edit) sẽ không làm gì cả.
    // Đăng ký 1 formatter reindent theo dấu {} để lệnh này hoạt động thật.
    if (!(window as any).__ideAnkbCppFormatter) {
      (window as any).__ideAnkbCppFormatter = true;
      const reindent = (text: string): string => {
        const out: string[] = [];
        let depth = 0;
        for (const rawLine of text.split("\n")) {
          const line = rawLine.trim();
          if (!line) {
            out.push("");
            continue;
          }
          if (line.startsWith("#")) {
            out.push(line); // preprocessor giữ nguyên, không indent
            continue;
          }
          let level = depth;
          if (line.startsWith("}")) level = Math.max(0, level - 1);
          if (/^(public|private|protected)\s*:/.test(line)) level = Math.max(0, depth - 1);
          if (/^(case\b[\s\S]*|default)\s*:/.test(line)) level = Math.max(0, depth - 1);
          out.push("    ".repeat(level) + line);
          // Đếm {} sau khi bỏ chuỗi/comment để không lệch depth
          const codeOnly = line
            .replace(/\/\/.*$/, "")
            .replace(/"(?:\\.|[^"\\])*"/g, '""')
            .replace(/'(?:\\.|[^'\\])*'/g, "''");
          const opens = (codeOnly.match(/{/g) || []).length;
          const closes = (codeOnly.match(/}/g) || []).length;
          depth = Math.max(0, depth + opens - closes);
        }
        return out.join("\n");
      };
      const provider = {
        displayName: "ide.ankb C/C++ reindent",
        provideDocumentFormattingEdits(model: editor.ITextModel) {
          return [{ range: model.getFullModelRange(), text: reindent(model.getValue()) }];
        },
      };
      monaco.languages.registerDocumentFormattingEditProvider("cpp", provider);
      monaco.languages.registerDocumentFormattingEditProvider("c", provider);
    }

    // Focus editor
    editor.focus();
  };

  return (
    <div className="editor-container">
      <MonacoEditor
        height="100%"
        path={path}
        language={language}
        theme="vs-dark"
        value={code}
        loading={(
          <div className="editor-loading">
            <span className="editor-loading-spinner" />
            Đang tải Monaco Editor…
          </div>
        )}
        onMount={handleMount}
        onChange={(value) => onChange(value || "")}
        options={{
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
          fontLigatures: true,
          minimap: { enabled: minimap, scale: 1 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "phase",
          cursorSmoothCaretAnimation: "on",
          tabSize: 4,
          insertSpaces: true,
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          stickyScroll: { enabled: true },
          padding: { top: 12, bottom: 12 },
          suggestOnTriggerCharacters: true,
          quickSuggestions: { other: true, comments: false, strings: false },
          wordWrap: "off",
          automaticLayout: true,
        }}
      />
    </div>
  );
}
