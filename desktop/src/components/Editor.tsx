import { useRef } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";

interface EditorProps {
  code: string;
  onChange: (value: string) => void;
  language?: string;
}

export default function Editor({ code, onChange, language = "cpp" }: EditorProps) {
  const editorRef = useRef<any>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Configure C++ IntelliSense
    monaco.languages.cpp.setDefaults({
      ...monaco.languages.cpp,
    });

    // Add snippets
    monaco.languages.registerCompletionItemProvider("cpp", {
      provideCompletionItems: (model, position) => {
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

    // Focus editor
    editor.focus();
  };

  return (
    <div className="editor-container">
      <MonacoEditor
        height="100%"
        language={language}
        theme="vs-dark"
        value={code}
        onMount={handleMount}
        onChange={(value) => onChange(value || "")}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1 },
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
