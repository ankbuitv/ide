using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using System.Diagnostics;

namespace IdeAnkb
{
    public partial class MainWindow : Window
    {
        private string currentFilePath = null;
        private bool hasLocalGcc = false;
        private string gccVersion = "";

        // Discord RPC - optional, set DISCORD_CLIENT_ID env var
        private dynamic discordClient;
        private long discordStartTimestamp;

        public MainWindow()
        {
            InitializeComponent();
            CppVersionCombo.SelectionChanged += (s, e) => UpdateLangChip();
            EditorBox.SelectionChanged += (s, e) => UpdateCursor();
            UpdateLangChip();

            // Set default Hello world template (fix XAML MC3000)
            if (string.IsNullOrWhiteSpace(EditorBox.Text))
            {
                EditorBox.Text = "#include <bits/stdc++.h>\nusing namespace std;\n\n#define fors(i, a, b) for (int i = a; i < b; i++)\n\n#define ll long long\n\nvoid sub() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(0); cout.tie(0);\n}\n\nvoid sol() {\n   cout << \"Hello world!\";\n}\n\nint main() {\n    sub();\n    sol();\n    return 0;\n}\n";
            }

            // Check local compiler
            CheckLocalCompiler();
            try { InitDiscordRpc(); } catch { }
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

        private void InitDiscordRpc()
        {
            try
            {
                // Try to load Lachee.DiscordRPC via reflection (so app works even without package)
                var discordAssembly = AppDomain.CurrentDomain.GetAssemblies();
                // Simple init via dynamic if available
                var clientId = Environment.GetEnvironmentVariable("DISCORD_CLIENT_ID") ?? "1420000000000000000";
                if (string.IsNullOrWhiteSpace(clientId) || clientId == "1420000000000000000") return;

                // If Lachee.DiscordRPC not available, skip
                try
                {
                    var rpcClientType = Type.GetType("Lachee.DiscordRPC.DiscordRpcClient, Lachee.DiscordRPC");
                    if (rpcClientType == null) return;
                    discordClient = Activator.CreateInstance(rpcClientType, clientId);
                    var onReady = rpcClientType.GetEvent("OnReady");
                    var initialize = rpcClientType.GetMethod("Initialize");
                    initialize?.Invoke(discordClient, null);
                    discordStartTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    UpdateDiscordPresence("Editing", "main.cpp - ide.ankb");
                }
                catch { }
            }
            catch { }
        }

        private void UpdateDiscordPresence(string details, string state, string largeKey = "logo", string smallKey = "")
        {
            try
            {
                if (discordClient == null) return;
                var isInitProp = discordClient.GetType().GetProperty("IsInitialized");
                if (isInitProp != null && !(bool)isInitProp.GetValue(discordClient)) return;

                var richPresenceType = Type.GetType("Lachee.DiscordRPC.RichPresence, Lachee.DiscordRPC");
                var assetsType = Type.GetType("Lachee.DiscordRPC.Assets, Lachee.DiscordRPC");
                var timestampsType = Type.GetType("Lachee.DiscordRPC.Timestamps, Lachee.DiscordRPC");
                var buttonType = Type.GetType("Lachee.DiscordRPC.Button, Lachee.DiscordRPC");

                dynamic presence = Activator.CreateInstance(richPresenceType);
                presence.Details = details;
                presence.State = state;
                if (timestampsType != null)
                {
                    dynamic ts = Activator.CreateInstance(timestampsType);
                    ts.StartUnixMilliseconds = (ulong)(discordStartTimestamp * 1000);
                    presence.Timestamps = ts;
                }
                if (assetsType != null)
                {
                    dynamic assets = Activator.CreateInstance(assetsType);
                    assets.LargeImageKey = largeKey;
                    assets.LargeImageText = "ide.ankb — C++ Online IDE";
                    assets.SmallImageKey = smallKey;
                    assets.SmallImageText = currentFilePath != null ? System.IO.Path.GetFileName(currentFilePath) : "main.cpp";
                    presence.Assets = assets;
                }
                var setPresence = discordClient.GetType().GetMethod("SetPresence");
                setPresence?.Invoke(discordClient, new object[] { presence });
            }
            catch { }
        }

        private void CheckLocalCompiler()
        {
            try
            {
                var psi = new ProcessStartInfo("g++", "--version") { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                using var proc = Process.Start(psi);
                proc.WaitForExit(2000);
                var output = proc.StandardOutput.ReadToEnd();
                hasLocalGcc = proc.ExitCode == 0 && output.ToLower().Contains("g++");
                gccVersion = output.Split('\n')[0].Trim();
                if (hasLocalGcc)
                {
                    StatusBackend.Text = $"Mode: Local g++ ({gccVersion})";
                    ConnLabel.Text = $"🟢 Online (Local g++)";
                    ConnBadge.ToolTip = $"Local compiler found:\n{gccVersion}\nC++ versions: 23→11 descending\nReady to compile locally, no internet needed";
                    StatusMsg.Text = "Ready - Local g++";
                    try { UpdateDiscordPresence("Ready — Local g++ available", "main.cpp - ide.ankb"); } catch { }
                }
                else
                {
                    StatusBackend.Text = "Mode: No compiler";
                    ConnLabel.Text = "🔴 No g++ found";
                    ConnBadge.ToolTip = "No local g++ compiler found!\n\nInstall MinGW-w64:\n1. winget install MSYS2.MSYS2\n2. Open MSYS2 MinGW64 terminal: pacman -S mingw-w64-x86_64-gcc\n3. Add C:\\msys64\\mingw64\\bin to PATH\n4. Restart app and run g++ --version\n\nOr install: https://www.mingw-w64.org/downloads/";
                    StatusMsg.Text = "⚠️ No g++ — install required";
                }
            }
            catch
            {
                hasLocalGcc = false;
                StatusBackend.Text = "Mode: No compiler";
                ConnLabel.Text = "🔴 No g++ found";
                ConnBadge.ToolTip = "g++ not found in PATH\n\nInstall:\nwinget install MSYS2.MSYS2\npacman -S mingw-w64-x86_64-gcc\nAdd C:\\msys64\\mingw64\\bin to PATH";
                StatusMsg.Text = "⚠️ Install g++ required";
            }
        }

        private async void Run_Click(object sender, RoutedEventArgs e)
        {
            // If no local compiler, require installation
            if (!hasLocalGcc)
            {
                var result = MessageBox.Show(
                    "Local g++ compiler not found!\n\n" +
                    "This desktop version (branch app) uses compiler on your machine only (no Judge0/Wandbox).\n\n" +
                    "Install steps:\n" +
                    "1. winget install MSYS2.MSYS2\n" +
                    "2. Open MSYS2 MinGW 64-bit terminal\n" +
                    "3. Run: pacman -S mingw-w64-x86_64-gcc\n" +
                    "4. Add to PATH: C:\\msys64\\mingw64\\bin\n" +
                    "5. Restart app, run g++ --version to verify\n\n" +
                    "Or install MinGW-w64 from https://www.mingw-w64.org/downloads/\n\n" +
                    "Do you want to open MinGW download page?",
                    "ide.ankb — g++ not found",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);

                if (result == MessageBoxResult.Yes)
                {
                    try { Process.Start(new ProcessStartInfo("https://www.mingw-w64.org/downloads/") { UseShellExecute = true }); } catch { }
                }
                return;
            }

            var code = EditorBox.Text;
            var stdin = StdinBox.Text;
            var cppVer = "23";
            if (CppVersionCombo.SelectedItem is ComboBoxItem sel && sel.Tag is string v) cppVer = v;

            if (string.IsNullOrWhiteSpace(code))
            {
                MessageBox.Show("Code is empty!", "ide.ankb", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            RunButton.IsEnabled = false;
            RunButton.Content = "⏳ Compiling...";
            RunButton.Style = (Style)FindResource("RunButtonRunning");
            OutputBox.Text = $"⏳ Compiling with local g++ C++{cppVer} ({gccVersion})...\n";
            OutputBox.Text += $"--- Code: {code.Length} chars, stdin: {stdin.Length} chars, C++{cppVer} descending 23→11 ---\n";
            StatusMsg.Text = $"⏳ Compiling C++{cppVer} (local g++)...";
            TimeChip.Text = "— ms";
            var sw = Stopwatch.StartNew();
            try { UpdateDiscordPresence($"Compiling C++{cppVer} (local g++)", $"{System.IO.Path.GetFileName(currentFilePath ?? "main.cpp")} - ide.ankb", "logo", "running"); } catch { }

            try
            {
                var compileResult = await RunWithLocalGcc(code, stdin, cppVer);
                sw.Stop();
                var elapsed = sw.ElapsedMilliseconds;

                if (!compileResult.Success)
                {
                    if (compileResult.Stage == "compile")
                    {
                        OutputBox.Text = $"❌ Compile Error (C++{cppVer} via local g++ {gccVersion})\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"Compiler: g++ {cppVer} ({gccVersion})\n";
                        OutputBox.Text += $"Exit: {compileResult.ExitCode}\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"{compileResult.CompileError}\n";
                        if (!string.IsNullOrWhiteSpace(compileResult.Stderr))
                            OutputBox.Text += $"\n[stderr]\n{compileResult.Stderr}\n";
                        OutputBox.Text += $"\n💡 Fix: Check line {ExtractLineNumber(compileResult.CompileError)}, missing ';', undefined reference, etc.\n";
                        StatusMsg.Text = "❌ Compile Error";
                        try { UpdateDiscordPresence($"Compile Error C++{cppVer}", compileResult.CompileError.Split('\n')[0].Trim(), "logo", "error"); } catch { }
                    }
                    else
                    {
                        OutputBox.Text = $"💥 Runtime Error (local g++)\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"Stage: {compileResult.Stage}\n";
                        OutputBox.Text += $"Exit: {compileResult.ExitCode}\n";
                        OutputBox.Text += $"Time: {compileResult.Time}\n";
                        OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                        OutputBox.Text += $"Stderr: {compileResult.Stderr}\n";
                        OutputBox.Text += $"Stdout: {compileResult.Stdout}\n";
                        OutputBox.Text += $"CompileError: {compileResult.CompileError}\n";
                        StatusMsg.Text = "💥 Runtime Error";
                        try { UpdateDiscordPresence($"Runtime Error", $"Exit {compileResult.ExitCode}", "logo", "error"); } catch { }
                    }
                }
                else
                {
                    OutputBox.Text = $"✅ Success (C++{cppVer} via local g++ {gccVersion})\n";
                    OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                    OutputBox.Text += $"Compiler: g++ C++{cppVer}\n";
                    OutputBox.Text += $"Time: {compileResult.Time ?? elapsed + "ms"}\n";
                    OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                    if (!string.IsNullOrWhiteSpace(compileResult.Stdout))
                        OutputBox.Text += compileResult.Stdout;
                    else
                        OutputBox.Text += "// (no stdout)\n";
                    if (!string.IsNullOrWhiteSpace(compileResult.Stderr))
                        OutputBox.Text += $"\n[stderr]\n{compileResult.Stderr}\n";
                    OutputBox.Text += $"\n✓ Completed in {elapsed} ms [local-g++]";
                    StatusMsg.Text = "✔ Success";
                    try { UpdateDiscordPresence($"Running Success C++{cppVer}", $"Output: {compileResult.Stdout?.Length ?? 0} chars", "logo", "success"); } catch { }
                }

                TimeChip.Text = $"{elapsed} ms";
                StatusTime.Text = $"{elapsed} ms";
                StatusBackend.Text = $"Mode: Local g++ {gccVersion}";
                RunButton.Content = compileResult.Success ? "✔ Success" : "❌ Failed";
                await Task.Delay(2000);
                RunButton.Content = "▶ Run (F5)";
            }
            catch (Exception ex)
            {
                OutputBox.Text = $"❌ Local compiler error\n";
                OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                OutputBox.Text += $"Error: {ex.Message}\n";
                OutputBox.Text += $"{ex}\n";
                OutputBox.Text += $"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
                OutputBox.Text += $"Fix: Ensure g++ is in PATH\n";
                OutputBox.Text += $"winget install MSYS2.MSYS2\n";
                OutputBox.Text += $"pacman -S mingw-w64-x86_64-gcc\n";
                StatusMsg.Text = "❌ Error";
            }
            finally
            {
                RunButton.IsEnabled = true;
                RunButton.Content = "▶ Run (F5)";
                RunButton.Style = null;
            }
        }

        private string ExtractLineNumber(string error)
        {
            try
            {
                var m = System.Text.RegularExpressions.Regex.Match(error, @"(?:main\.cpp|:|line )(\d+):?(\d+)?");
                if (m.Success) return $"line {m.Groups[1].Value}";
            }
            catch { }
            return "";
        }

        public class Judge0Result
        {
            public bool Success { get; set; }
            public string Stage { get; set; } = "run";
            public string Stdout { get; set; } = "";
            public string Stderr { get; set; } = "";
            public string CompileError { get; set; } = "";
            public int ExitCode { get; set; }
            public string Mode { get; set; } = "local-g++";
            public string Backend { get; set; } = "local";
            public string Compiler { get; set; } = "";
            public string Time { get; set; } = "";
            public string Memory { get; set; } = "";
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

                var compilePsi = new ProcessStartInfo("g++", $"{stdFlag} -O2 -pipe -o \"{exePath}\" \"{srcPath}\"") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = tempDir };
                using var compileProc = Process.Start(compilePsi);
                var compileErr = await compileProc.StandardError.ReadToEndAsync();
                var compileOut = await compileProc.StandardOutput.ReadToEndAsync();
                await compileProc.WaitForExitAsync();

                var combinedCompileOutput = compileErr + compileOut;

                if (compileProc.ExitCode != 0)
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                    return new Judge0Result { Success = false, Stage = "compile", Stdout = compileOut, Stderr = compileErr, CompileError = combinedCompileOutput, ExitCode = compileProc.ExitCode, Mode = "local-g++", Backend = "local", Compiler = $"g++ {stdFlag} ({gccVersion})" };
                }

                var runPsi = new ProcessStartInfo() { FileName = exePath, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = tempDir };
                using var runProc = new Process() { StartInfo = runPsi };
                runProc.Start();
                if (!string.IsNullOrEmpty(stdin)) await runProc.StandardInput.WriteAsync(stdin);
                runProc.StandardInput.Close();

                var cts = new System.Threading.CancellationTokenSource(2000);
                var stdoutTask = runProc.StandardOutput.ReadToEndAsync();
                var stderrTask = runProc.StandardError.ReadToEndAsync();
                try { await Task.WhenAll(stdoutTask, stderrTask).WaitAsync(TimeSpan.FromSeconds(2), cts.Token); }
                catch
                {
                    try { runProc.Kill(); } catch { }
                    return new Judge0Result { Success = false, Stage = "run", Stdout = await stdoutTask, Stderr = "Timed out after 2s", CompileError = "", ExitCode = 124, Mode = "local-g++", Backend = "local", Compiler = $"g++ {stdFlag}" };
                }
                await runProc.WaitForExitAsync();
                var stdoutRes = await stdoutTask;
                var stderrRes = await stderrTask;
                try { Directory.Delete(tempDir, true); } catch { }

                return new Judge0Result { Success = runProc.ExitCode == 0, Stage = "run", Stdout = stdoutRes, Stderr = stderrRes, CompileError = "", ExitCode = runProc.ExitCode, Mode = "local-g++", Backend = "local", Compiler = $"g++ {stdFlag} ({gccVersion})", Time = "", Memory = "" };
            }
            catch (Exception ex)
            {
                return new Judge0Result { Success = false, Stage = "error", Stderr = $"Local g++ failed: {ex.Message}\nMake sure MinGW g++ is installed and in PATH (C:\\MinGW\\bin or C:\\msys64\\mingw64\\bin)\n\nInstall: winget install MSYS2.MSYS2\nThen: pacman -S mingw-w64-x86_64-gcc\nAdd C:\\msys64\\mingw64\\bin to PATH", CompileError = ex.ToString(), ExitCode = 500, Mode = "local-g++-error", Backend = "local" };
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
                    try { UpdateDiscordPresence($"Editing {System.IO.Path.GetFileName(dlg.FileName)}", "ide.ankb - local g++", "logo", ""); } catch { }
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
                try { File.WriteAllText(dlg.FileName, EditorBox.Text); currentFilePath = dlg.FileName; TabFileName.Text = System.IO.Path.GetFileName(dlg.FileName); } 
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
