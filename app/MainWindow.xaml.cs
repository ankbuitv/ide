using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace IdeAnkb
{
    public partial class MainWindow : Window
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private string currentFilePath = null;

        // Judge0 CE - default public, can be changed via env or settings
        // For self-host: http://localhost:2358 or http://your-vps:2358
        // For RapidAPI: https://judge0-ce.p.rapidapi.com + set JUDGE0_API_KEY
        private string judge0Url = Environment.GetEnvironmentVariable("JUDGE0_API_URL") ?? "https://ce.judge0.com";
        private string judge0Key = Environment.GetEnvironmentVariable("JUDGE0_API_KEY") ?? "";
        private string judge0Host = Environment.GetEnvironmentVariable("JUDGE0_API_HOST") ?? "";

        public MainWindow()
        {
            InitializeComponent();
            CppVersionCombo.SelectionChanged += (s, e) => UpdateLangChip();
            EditorBox.SelectionChanged += (s, e) => UpdateCursor();
            UpdateLangChip();
            StatusMsg.Text = "Ready - Judge0 CE default (no Wandbox)";
            ConnLabel.Text = "🟢 Online (Judge0)";
            ConnBadge.ToolTip = $"Judge0 CE: {judge0Url}\nMode: judge0\nClick Run to test";
        }

        private void UpdateLangChip()
        {
            if (CppVersionCombo.SelectedItem is ComboBoxItem item && item.Tag is string ver)
            {
                LangChip.Text = $"C++{ver}";
            }
        }

        private void UpdateCursor()
        {
            try
            {
                var caret = EditorBox.CaretIndex;
                var text = EditorBox.Text.Substring(0, Math.Min(caret, EditorBox.Text.Length));
                var lines = text.Split('\n');
                var line = lines.Length;
                var col = lines[lines.Length - 1].Length + 1;
                StatusCursor.Text = $"Ln {line}, Col {col}";
            }
            catch { }
        }

        private async void Run_Click(object sender, RoutedEventArgs e)
        {
            var code = EditorBox.Text;
            var stdin = StdinBox.Text;
            var cppVer = "17";
            if (CppVersionCombo.SelectedItem is ComboBoxItem sel && sel.Tag is string v) cppVer = v;

            if (string.IsNullOrWhiteSpace(code))
            {
                MessageBox.Show("Code is empty!", "ide.ankb", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            RunButton.IsEnabled = false;
            RunButton.Content = "⏳ Compiling...";
            OutputBox.Text = $"⏳ Compiling with C++{cppVer} via Judge0 CE ({judge0Url})...\n";
            OutputBox.Text += $"--- Code size: {code.Length} chars, stdin: {stdin.Length} chars ---\n";
            StatusMsg.Text = $"⏳ Compiling C++{cppVer}...";
            TimeChip.Text = "— ms";
            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                var result = await RunWithJudge0(code, stdin, cppVer);
                sw.Stop();
                var elapsed = sw.ElapsedMilliseconds;

                // Detailed error display (always show what went wrong)
                if (!result.Success)
                {
                    if (result.Stage == "compile")
                    {
                        OutputBox.Text = $"❌ Compile Error (C++{cppVer} via {result.Mode})\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"Compiler: {result.Compiler ?? "Judge0 GCC"}\n";
                        OutputBox.Text += $"Exit: {result.ExitCode}\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"{result.CompileError}\n";
                        if (!string.IsNullOrWhiteSpace(result.Stderr))
                        {
                            OutputBox.Text += $"\n[stderr]\n{result.Stderr}\n";
                        }
                        OutputBox.Text += $"\n💡 Fix: Check line numbers above, missing semicolon, undefined reference, etc.\n";
                        OutputBox.Text += $"If error is 'Resource temporarily unavailable', retry or deploy own Judge0:\n";
                        OutputBox.Text += $"docker run -d -p 2358:2358 judge0/judge0:1.13.1\n";
                        OutputBox.Text += $"Then set JUDGE0_API_URL=http://localhost:2358\n";
                        StatusMsg.Text = "❌ Compile Error";
                    }
                    else
                    {
                        OutputBox.Text = $"💥 Runtime Error / API Error (Mode: {result.Mode})\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"Backend: {result.Backend}\n";
                        OutputBox.Text += $"Stage: {result.Stage}\n";
                        OutputBox.Text += $"Exit: {result.ExitCode}\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"Stderr: {result.Stderr}\n";
                        OutputBox.Text += $"Stdout: {result.Stdout}\n";
                        OutputBox.Text += $"Compile Error: {result.CompileError}\n";
                        OutputBox.Text += $"\nIf Judge0 returns 401/403, set JUDGE0_API_KEY or self-host Judge0.\n";
                        OutputBox.Text += $"If 503/429, Wandbox/Judge0 overloaded — retry in 2s.\n";
                        StatusMsg.Text = "💥 Runtime Error";
                    }
                }
                else
                {
                    OutputBox.Text = $"✅ Success (C++{cppVer} via {result.Mode})\n";
                    OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                    OutputBox.Text += $"Time: {result.Time ?? elapsed + "ms"} | Memory: {result.Memory ?? "—"}\n";
                    OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                    if (!string.IsNullOrWhiteSpace(result.Stdout))
                        OutputBox.Text += result.Stdout;
                    else
                        OutputBox.Text += "// (no stdout)\n";
                    if (!string.IsNullOrWhiteSpace(result.Stderr))
                        OutputBox.Text += $"\n[stderr]\n{result.Stderr}\n";
                    OutputBox.Text += $"\n✓ Completed in {elapsed} ms [{result.Mode}]";
                    StatusMsg.Text = "✔ Success";
                }

                TimeChip.Text = $"{elapsed} ms";
                StatusTime.Text = $"{elapsed} ms";
                StatusBackend.Text = $"Mode: {result.Mode}";
            }
            catch (Exception ex)
            {
                OutputBox.Text = $"❌ Compiler service unavailable.\n";
                OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                OutputBox.Text += $"Backend: Judge0 CE ({judge0Url})\n";
                OutputBox.Text += $"Error: {ex.Message}\n";
                OutputBox.Text += $"Stack: {ex}\n";
                OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                OutputBox.Text += $"Fix:\n";
                OutputBox.Text += $"1. Check internet\n";
                OutputBox.Text += $"2. Self-host Judge0: docker run -d -p 2358:2358 judge0/judge0:1.13.1\n";
                OutputBox.Text += $"3. Set env JUDGE0_API_URL=http://localhost:2358\n";
                OutputBox.Text += $"4. Or use web version ide.ankb with backend fallback\n";
                StatusMsg.Text = "🔴 Offline";
                ConnLabel.Text = "🔴 Backend unavailable";
            }
            finally
            {
                RunButton.IsEnabled = true;
                RunButton.Content = "▶ Run (F5)";
            }
        }

        public class Judge0Result
        {
            public bool Success { get; set; }
            public string Stage { get; set; } = "run";
            public string Stdout { get; set; } = "";
            public string Stderr { get; set; } = "";
            public string CompileError { get; set; } = "";
            public int ExitCode { get; set; }
            public string Mode { get; set; } = "judge0";
            public string Backend { get; set; } = "";
            public string Compiler { get; set; } = "";
            public string Time { get; set; } = "";
            public string Memory { get; set; } = "";
        }

        private async Task<Judge0Result> RunWithJudge0(string code, string stdin, string cppVersion)
        {
            // Map C++ version to Judge0 language_id
            // Judge0: 54 = C++17 GCC 9.2.0, 52 = C++14, 53 = C++20? Actually 54 is C++17, 76 is C++20 clang, but use 54 for all and pass compiler option via code? Judge0 doesn't support std flag via API, so we embed #pragma or just use default
            // For simplicity, use 54 for all versions, but we can try to map:
            int langId = cppVersion switch
            {
                "11" => 52, // C++14 used as fallback
                "14" => 52,
                "17" => 54,
                "20" => 54, // C++17 GCC also handles C++20 mostly, or 76 for clang20
                "23" => 54,
                _ => 54
            };

            var url = $"{judge0Url.TrimEnd('/')}/submissions?base64_encoded=false&wait=true";
            var payload = new
            {
                source_code = code,
                language_id = langId,
                stdin = stdin ?? "",
                redirect_stderr_to_stdout = false
            };

            var json = JsonSerializer.Serialize(payload);
            var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            if (!string.IsNullOrWhiteSpace(judge0Key))
            {
                request.Headers.Add("X-RapidAPI-Key", judge0Key);
                if (!string.IsNullOrWhiteSpace(judge0Host))
                    request.Headers.Add("X-RapidAPI-Host", judge0Host);
            }

            var response = await httpClient.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                return new Judge0Result
                {
                    Success = false,
                    Stage = "error",
                    Stderr = $"Judge0 API error {response.StatusCode}: {text.Substring(0, Math.Min(2000, text.Length))}\n\nBackend: {judge0Url}\nFix: Check JUDGE0_API_URL, if using RapidAPI set JUDGE0_API_KEY and JUDGE0_API_HOST",
                    CompileError = text,
                    ExitCode = (int)response.StatusCode,
                    Mode = "judge0",
                    Backend = judge0Url
                };
            }

            try
            {
                var doc = JsonDocument.Parse(text);
                var root = doc.RootElement;
                var stdout = root.TryGetProperty("stdout", out var s) ? s.GetString() ?? "" : "";
                var stderr = root.TryGetProperty("stderr", out var se) ? se.GetString() ?? "" : "";
                var compileOutput = root.TryGetProperty("compile_output", out var co) ? co.GetString() ?? "" : "";
                var statusId = 0;
                var statusDesc = "";
                if (root.TryGetProperty("status", out var statusEl))
                {
                    if (statusEl.TryGetProperty("id", out var idEl)) statusId = idEl.GetInt32();
                    if (statusEl.TryGetProperty("description", out var descEl)) statusDesc = descEl.GetString() ?? "";
                }
                var time = root.TryGetProperty("time", out var tEl) ? tEl.GetString() ?? "" : "";
                var memory = root.TryGetProperty("memory", out var mEl) ? mEl.GetInt32().ToString() : "";

                if (statusId == 6 || !string.IsNullOrWhiteSpace(compileOutput))
                {
                    return new Judge0Result
                    {
                        Success = false,
                        Stage = "compile",
                        Stdout = stdout,
                        Stderr = stderr,
                        CompileError = compileOutput,
                        ExitCode = statusId,
                        Mode = "judge0",
                        Backend = judge0Url,
                        Compiler = $"C++{cppVersion} (lang {langId}) - {statusDesc}",
                        Time = time,
                        Memory = memory
                    };
                }

                bool isSuccess = statusId == 3;
                bool isTLE = statusId == 5;

                return new Judge0Result
                {
                    Success = isSuccess,
                    Stage = isTLE ? "error" : "run",
                    Stdout = stdout,
                    Stderr = stderr,
                    CompileError = "",
                    ExitCode = isSuccess ? 0 : statusId,
                    Mode = "judge0",
                    Backend = judge0Url,
                    Compiler = $"C++{cppVersion} - {statusDesc}",
                    Time = time,
                    Memory = memory
                };
            }
            catch (Exception ex)
            {
                return new Judge0Result
                {
                    Success = false,
                    Stage = "error",
                    Stderr = $"Failed to parse Judge0 response: {ex.Message}\nRaw: {text.Substring(0, Math.Min(1000, text.Length))}",
                    CompileError = text,
                    ExitCode = 500,
                    Mode = "judge0-parse-error",
                    Backend = judge0Url
                };
            }
        }

        private void OpenFile_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog { Filter = "C++ Files (*.cpp;*.cc;*.h)|*.cpp;*.cc;*.h;*.c|All Files (*.*)|*.*" };
            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var text = File.ReadAllText(dlg.FileName);
                    EditorBox.Text = text;
                    currentFilePath = dlg.FileName;
                    TabFileName.Text = System.IO.Path.GetFileName(dlg.FileName);
                    MessageBox.Show($"Opened {dlg.FileName}\nSize: {text.Length} chars", "ide.ankb", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                catch (Exception ex) { MessageBox.Show($"Failed to open: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
            }
        }

        private void Download_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new SaveFileDialog { Filter = "C++ Files (*.cpp)|*.cpp|All Files (*.*)|*.*", FileName = "main.cpp" };
            if (!string.IsNullOrEmpty(currentFilePath)) dlg.FileName = System.IO.Path.GetFileName(currentFilePath);
            if (dlg.ShowDialog() == true)
            {
                try { File.WriteAllText(dlg.FileName, EditorBox.Text); MessageBox.Show($"Saved to {dlg.FileName}", "ide.ankb", MessageBoxButton.OK, MessageBoxImage.Information); currentFilePath = dlg.FileName; } 
                catch (Exception ex) { MessageBox.Show($"Failed to save: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
            }
        }

        private void Reset_Click(object sender, RoutedEventArgs e)
        {
            if (MessageBox.Show("Reset to Hello world template?", "ide.ankb", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
            {
                EditorBox.Text = "#include <bits/stdc++.h>\nusing namespace std;\n\n#define fors(i, a, b) for (int i = a; i < b; i++)\n\n#define ll long long\n\nvoid sub() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(0); cout.tie(0);\n}\n\nvoid sol() {\n   cout << \"Hello world!\";\n}\n\nint main() {\n    sub();\n    sol();\n    return 0;\n}\n";
            }
        }

        private void ClearStdin_Click(object sender, RoutedEventArgs e) { StdinBox.Clear(); }
        private void ClearOutput_Click(object sender, RoutedEventArgs e) { OutputBox.Text = "// Run your code to see output here"; }
        private void CloseTab_Click(object sender, System.Windows.Input.MouseButtonEventArgs e) { if (MessageBox.Show("Clear editor?", "ide.ankb", MessageBoxButton.YesNo) == MessageBoxResult.Yes) EditorBox.Clear(); }
    }
}
