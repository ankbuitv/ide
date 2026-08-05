using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
// Discord RPC - add via NuGet Lachee.DiscordRPC
using Lachee.DiscordRPC;
using Lachee.DiscordRPC.Events;

namespace IdeAnkb
{
    public partial class MainWindow : Window
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private string currentFilePath = null;
        private DiscordRPC.DiscordRpcClient discordClient;
        private long discordStartTimestamp;

        // Self-host options (simplest to most complex):
        // 1. Own Node backend (simplest, single container): BACKEND_URL=http://localhost:8080
        //    docker-compose up -d --build (pids_limit 2048, mem 2GB)
        // 2. Judge0 CE: JUDGE0_API_URL=http://localhost:2358
        //    docker run -d -p 2358:2358 judge0/judge0:1.13.1 (needs postgres/redis, use docker-compose.yml judge0 service)
        // For GitHub Actions self-host judge0 workflow, set JUDGE0_API_URL via env and fill url in UI
        private string backendUrl = Environment.GetEnvironmentVariable("BACKEND_URL") ?? "";
        private string judge0Url = Environment.GetEnvironmentVariable("JUDGE0_API_URL") ?? Environment.GetEnvironmentVariable("JUDGE0_URL") ?? "https://ce.judge0.com";
        private string judge0Key = Environment.GetEnvironmentVariable("JUDGE0_API_KEY") ?? "";
        private string judge0Host = Environment.GetEnvironmentVariable("JUDGE0_API_HOST") ?? "";
        private string discordClientId = Environment.GetEnvironmentVariable("DISCORD_CLIENT_ID") ?? "1420000000000000000"; // Replace with your Discord App Client ID from https://discord.com/developers/applications

        public MainWindow()
        {
            InitializeComponent();
            CppVersionCombo.SelectionChanged += (s, e) => UpdateLangChip();
            EditorBox.SelectionChanged += (s, e) => UpdateCursor();
            UpdateLangChip();
            var mode = !string.IsNullOrWhiteSpace(backendUrl) ? $"proxy ({backendUrl})" : $"Judge0 CE ({judge0Url})";
            StatusMsg.Text = $"Ready - {mode}";
            ConnLabel.Text = $"🟢 Online ({(string.IsNullOrWhiteSpace(backendUrl) ? "Judge0" : "Backend")})";
            ConnBadge.ToolTip = $"Backend: {(!string.IsNullOrWhiteSpace(backendUrl) ? backendUrl : judge0Url)}\nMode: {(string.IsNullOrWhiteSpace(backendUrl) ? "judge0" : "proxy")}\nC++ versions: 23→11 descending\nSingle .exe self-contained, no .NET needed on other machines";

            // Set default Hello world template (fix XAML MC3000 invalid '<' char by setting in code-behind, not XAML attribute)
            if (string.IsNullOrWhiteSpace(EditorBox.Text))
            {
                EditorBox.Text = "#include <bits/stdc++.h>\nusing namespace std;\n\n#define fors(i, a, b) for (int i = a; i < b; i++)\n\n#define ll long long\n\nvoid sub() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(0); cout.tie(0);\n}\n\nvoid sol() {\n   cout << \"Hello world!\";\n}\n\nint main() {\n    sub();\n    sol();\n    return 0;\n}\n";
            }
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
            var backendDesc = !string.IsNullOrWhiteSpace(backendUrl) ? $"Backend {backendUrl}" : $"Judge0 CE {judge0Url}";
            OutputBox.Text = $"⏳ Compiling with C++{cppVer} via {backendDesc}...\n";
            OutputBox.Text += $"--- Code size: {code.Length} chars, stdin: {stdin.Length} chars, C++{cppVer} (descending 23→11) ---\n";
            StatusMsg.Text = $"⏳ Compiling C++{cppVer}...";
            TimeChip.Text = "— ms";
            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                Judge0Result result;
                // 0. Try local g++ if available on machine (easiest for app version, per user request: xài compiler đang có trên máy cho dễ)
                if (hasLocalGcc)
                {
                    OutputBox.Text += $"Trying local g++ compiler (g++ {cppVer}) ...\n";
                    try { UpdateDiscordPresence($"Compiling C++{cppVer} (local g++)", $"{System.IO.Path.GetFileName(currentFilePath ?? "main.cpp")} - ide.ankb", "logo", "running"); } catch {}
                    result = await RunWithLocalGcc(code, stdin, cppVer);
                    // If local fails with not found, fallback to backend/judge0
                    if (!result.Success && result.Stage == "error" && result.Stderr.Contains("Local g++ failed"))
                    {
                        OutputBox.Text += $"Local g++ not available ({result.Stderr.Substring(0, Math.Min(200, result.Stderr.Length))}) — trying backend/Judge0...\n";
                        hasLocalGcc = false;
                        // fall through to backend/judge0
                        result = null;
                    }
                }
                else result = null;

                if (result == null)
                {
                    // 1. Try own backend first if BACKEND_URL set (simplest self-host: single container, no postgres/redis)
                    if (!string.IsNullOrWhiteSpace(backendUrl))
                    {
                        OutputBox.Text += $"Trying backend proxy {backendUrl}/api/run ...\n";
                        try { UpdateDiscordPresence($"Compiling via backend", $"C++{cppVer} - {backendUrl}", "logo", "running"); } catch {}
                        result = await RunWithBackend(code, stdin, cppVer);
                        // If backend returns 503/crun, fallback to Judge0
                        if (!result.Success && (result.Stderr?.Contains("crun") == true || result.Stderr?.Contains("Resource temporarily unavailable") == true || result.Stage == "error"))
                        {
                            OutputBox.Text += $"Backend busy ({result.Stderr.Substring(0, Math.Min(200, result.Stderr.Length))}) — falling back to Judge0...\n";
                            var fallback = await RunWithJudge0(code, stdin, cppVer);
                            if (fallback.Success || fallback.Stage == "compile") result = fallback;
                        }
                    }
                    else
                    {
                        try { UpdateDiscordPresence($"Compiling via Judge0 CE", $"C++{cppVer} - {judge0Url}", "logo", "running"); } catch {}
                        result = await RunWithJudge0(code, stdin, cppVer);
                    }
                }
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

        // Simplest self-host: own Node backend (backend/server.js) — single container, no postgres/redis
        // docker-compose up -d --build ide (port 8080)
        private async Task<Judge0Result> RunWithBackend(string code, string stdin, string cppVersion)
        {
            var url = $"{backendUrl.TrimEnd('/')}/api/run";
            var payload = new { code = code, stdin = stdin ?? "", version = cppVersion, cppVersion = cppVersion };
            var json = JsonSerializer.Serialize(payload);
            try
            {
                var resp = await httpClient.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));
                var text = await resp.Content.ReadAsStringAsync();
                JsonDocument doc;
                try { doc = JsonDocument.Parse(text); } catch { return new Judge0Result { Success = false, Stage = "error", Stderr = $"Backend non-JSON {resp.StatusCode}: {text.Substring(0, Math.Min(1000, text.Length))}", CompileError = text, ExitCode = (int)resp.StatusCode, Mode = "backend", Backend = backendUrl }; }
                var root = doc.RootElement;
                string GetStr(string name) => root.TryGetProperty(name, out var el) ? el.GetString() ?? "" : "";
                int GetInt(string name) => root.TryGetProperty(name, out var el) && el.TryGetInt32(out var v) ? v : 0;
                bool GetBool(string name) => root.TryGetProperty(name, out var el) && el.GetBoolean();

                var stage = GetStr("stage");
                if (string.IsNullOrWhiteSpace(stage)) stage = "run";
                var stdout = GetStr("stdout");
                var stderr = GetStr("stderr");
                var compileErr = GetStr("compile_error");
                var exitCode = GetInt("exit_code");
                var success = root.TryGetProperty("success", out var succEl) ? succEl.GetBoolean() : (exitCode == 0 && stage != "compile" && stage != "error");
                // Detailed error display
                if (stage == "compile" || (!string.IsNullOrWhiteSpace(compileErr) && !success))
                {
                    return new Judge0Result
                    {
                        Success = false,
                        Stage = "compile",
                        Stdout = stdout,
                        Stderr = stderr,
                        CompileError = compileErr,
                        ExitCode = exitCode,
                        Mode = "backend",
                        Backend = backendUrl,
                        Compiler = $"C++{cppVersion} g++",
                    };
                }
                if (!resp.IsSuccessStatusCode || stage == "error")
                {
                    return new Judge0Result
                    {
                        Success = false,
                        Stage = "error",
                        Stdout = stdout,
                        Stderr = stderr + "\n" + GetStr("error") + " " + GetStr("detail"),
                        CompileError = compileErr,
                        ExitCode = exitCode,
                        Mode = "backend",
                        Backend = backendUrl
                    };
                }
                return new Judge0Result
                {
                    Success = success,
                    Stage = stage,
                    Stdout = stdout,
                    Stderr = stderr,
                    CompileError = compileErr,
                    ExitCode = exitCode,
                    Mode = "backend",
                    Backend = backendUrl,
                    Time = GetStr("durationMs"),
                };
            }
            catch (Exception ex)
            {
                return new Judge0Result
                {
                    Success = false,
                    Stage = "error",
                    Stderr = $"Backend {backendUrl} unavailable: {ex.Message}\nFix: docker-compose up -d --build ide\nThen set BACKEND_URL=http://localhost:8080",
                    CompileError = ex.ToString(),
                    ExitCode = 500,
                    Mode = "backend-error",
                    Backend = backendUrl
                };
            }
        }


        private void InitDiscordRpc()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(discordClientId) || discordClientId == "1420000000000000000")
                {
                    Console.WriteLine("Discord RPC: No valid Client ID, skip. Create app at https://discord.com/developers/applications");
                    return;
                }
                discordClient = new DiscordRPC.DiscordRpcClient(discordClientId);
                discordClient.OnReady += (sender, e) => { Console.WriteLine($"Discord RPC Ready: {e.User.Username}"); };
                discordClient.OnError += (sender, e) => { Console.WriteLine($"Discord RPC Error: {e.Code} {e.Message}"); };
                discordClient.Initialize();
                discordStartTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                UpdateDiscordPresence("Editing", "main.cpp - ide.ankb", "logo", "");
            }
            catch (Exception ex) { Console.WriteLine($"Discord RPC init failed: {ex.Message}"); }
        }

        private void UpdateDiscordPresence(string details, string state, string largeImageKey = "logo", string smallImageKey = "")
        {
            try
            {
                if (discordClient == null || !discordClient.IsInitialized) return;
                discordClient.SetPresence(new RichPresence()
                {
                    Details = details,
                    State = state,
                    Timestamps = new Timestamps() { StartUnixMilliseconds = (ulong)(discordStartTimestamp * 1000) },
                    Assets = new Assets()
                    {
                        LargeImageKey = largeImageKey,
                        LargeImageText = "ide.ankb — C++ Online IDE",
                        SmallImageKey = smallImageKey,
                        SmallImageText = currentFilePath != null ? System.IO.Path.GetFileName(currentFilePath) : "main.cpp"
                    },
                    Buttons = new Button[]
                    {
                        new Button() { Label = "Open ide.ankb", Url = "https://github.com/ankbuitv/ide" }
                    }
                });
            }
            catch { }
        }

        private bool hasLocalGcc = false;
        private void CheckLocalCompiler()
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("g++", "--version") { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                using var proc = System.Diagnostics.Process.Start(psi);
                proc.WaitForExit(2000);
                var output = proc.StandardOutput.ReadToEnd();
                hasLocalGcc = proc.ExitCode == 0 && output.ToLower().Contains("g++");
                if (hasLocalGcc)
                {
                    StatusBackend.Text = $"Mode: Local g++ + {(string.IsNullOrWhiteSpace(backendUrl) ? "Judge0" : "Backend")}";
                    ConnLabel.Text = $"🟢 Online (Local g++ + Judge0)";
                    ConnBadge.ToolTip = $"Local compiler: {output.Split('\n')[0]}\nBackend: {(string.IsNullOrWhiteSpace(backendUrl) ? judge0Url : backendUrl)}\nModes: local g++, Judge0 CE, backend proxy";
                    try { UpdateDiscordPresence("Ready — Local g++ available", "main.cpp - ide.ankb"); } catch { }
                }
            }
            catch { hasLocalGcc = false; }
        }

        private async Task<Judge0Result> RunWithLocalGcc(string code, string stdin, string cppVersion)
        {
            try
            {
                var tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ide.ankb-" + Guid.NewGuid().ToString("N").Substring(0, 8));
                Directory.CreateDirectory(tempDir);
                var srcPath = System.IO.Path.Combine(tempDir, "main.cpp");
                var exePath = System.IO.Path.Combine(tempDir, "main.exe");
                if (Environment.OSVersion.Platform != PlatformID.Win32NT) exePath = System.IO.Path.Combine(tempDir, "main");
                var inPath = System.IO.Path.Combine(tempDir, "in.txt");
                await File.WriteAllTextAsync(srcPath, code);
                await File.WriteAllTextAsync(inPath, stdin ?? "");
                string stdFlag = cppVersion switch { "11" => "-std=c++11", "14" => "-std=c++14", "17" => "-std=c++17", "20" => "-std=c++20", "23" => "-std=c++23", _ => "-std=c++17" };
                var compilePsi = new System.Diagnostics.ProcessStartInfo("g++", $"{stdFlag} -O2 -pipe -o "{exePath}" "{srcPath}"") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = tempDir };
                using var compileProc = System.Diagnostics.Process.Start(compilePsi);
                var compileErr = await compileProc.StandardError.ReadToEndAsync();
                var compileOut = await compileProc.StandardOutput.ReadToEndAsync();
                await compileProc.WaitForExitAsync();
                if (compileProc.ExitCode != 0)
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                    return new Judge0Result { Success = false, Stage = "compile", Stdout = compileOut, Stderr = compileErr, CompileError = compileErr, ExitCode = compileProc.ExitCode, Mode = "local-g++", Backend = "local", Compiler = $"g++ {stdFlag}" };
                }
                var runPsi = new System.Diagnostics.ProcessStartInfo() { FileName = exePath, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = tempDir };
                using var runProc = new System.Diagnostics.Process() { StartInfo = runPsi };
                runProc.Start();
                if (!string.IsNullOrEmpty(stdin)) await runProc.StandardInput.WriteAsync(stdin);
                runProc.StandardInput.Close();
                var cts = new System.Threading.CancellationTokenSource(2000);
                var stdoutTask = runProc.StandardOutput.ReadToEndAsync();
                var stderrTask = runProc.StandardError.ReadToEndAsync();
                try { await Task.WhenAll(stdoutTask, stderrTask).WaitAsync(TimeSpan.FromSeconds(2), cts.Token); } catch { try { runProc.Kill(); } catch { } return new Judge0Result { Success = false, Stage = "run", Stdout = await stdoutTask, Stderr = "Timed out after 2s", CompileError = "", ExitCode = 124, Mode = "local-g++", Backend = "local", Compiler = $"g++ {stdFlag}" }; }
                await runProc.WaitForExitAsync();
                var stdoutRes = await stdoutTask; var stderrRes = await stderrTask;
                try { Directory.Delete(tempDir, true); } catch { }
                return new Judge0Result { Success = runProc.ExitCode == 0, Stage = "run", Stdout = stdoutRes, Stderr = stderrRes, CompileError = "", ExitCode = runProc.ExitCode, Mode = "local-g++", Backend = "local", Compiler = $"g++ {stdFlag}", Time = "", Memory = "" };
            }
            catch (Exception ex)
            {
                return new Judge0Result { Success = false, Stage = "error", Stderr = $"Local g++ failed: {ex.Message}\nMake sure MinGW g++ is in PATH (C:\\MinGW\\bin or C:\\msys64\\mingw64\\bin)", CompileError = ex.ToString(), ExitCode = 500, Mode = "local-g++-error", Backend = "local" };
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


        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            try { discordClient?.ClearPresence(); discordClient?.Deinitialize(); discordClient?.Dispose(); } catch { }
        }

    }
}
