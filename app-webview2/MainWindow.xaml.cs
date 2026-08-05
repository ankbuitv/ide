using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

namespace IdeAnkb.WebView2
{
    public partial class MainWindow : Window
    {
        private string gccPath = "g++";
        private bool hasLocalGcc = false;
        private string gccVersion = "";
        private dynamic discordClient;
        private long discordStart;

        public MainWindow()
        {
            InitializeComponent();
            Loaded += Window_Loaded;
            Closing += Window_Closing;
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            CheckLocalCompiler();
            InitDiscordRpc();
            await InitWebViewAsync();
        }

        private void CheckLocalCompiler()
        {
            try
            {
                string[] paths = new string[]
                {
                    @"C:\Program Files\CodeBlocks\MinGW\bin\g++.exe",
                    @"C:\Program Files (x86)\CodeBlocks\MinGW\bin\g++.exe",
                    @"C:\MinGW\bin\g++.exe",
                    @"C:\msys64\mingw64\bin\g++.exe",
                    @"C:\msys64\ucrt64\bin\g++.exe",
                    @"C:\mingw64\bin\g++.exe",
                };
                string found = null;
                string ver = "";
                // Try PATH first
                try
                {
                    var psi = new ProcessStartInfo("g++", "--version") { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                    using var p = Process.Start(psi);
                    p.WaitForExit(1500);
                    var o = p.StandardOutput.ReadToEnd();
                    if (p.ExitCode == 0 && o.ToLower().Contains("g++")) { found = "g++"; ver = o.Split('\n')[0]; }
                }
                catch { }

                if (found == null)
                {
                    foreach (var p in paths)
                    {
                        if (File.Exists(p))
                        {
                            try
                            {
                                var psi = new ProcessStartInfo(p, "--version") { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                                using var proc = Process.Start(psi);
                                proc.WaitForExit(1500);
                                var o = proc.StandardOutput.ReadToEnd();
                                if (proc.ExitCode == 0) { found = p; ver = o.Split('\n')[0]; break; }
                            }
                            catch { continue; }
                        }
                    }
                }

                if (found != null)
                {
                    hasLocalGcc = true;
                    gccPath = found;
                    gccVersion = ver;
                    GccStatus.Text = $"✅ {System.IO.Path.GetFileName(Path.GetDirectoryName(found) ?? found)} {ver.Split(' ')[^1]} | g++ ready";
                    GccStatus.Foreground = new System.Windows.Media.SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#3fb950"));
                    UpdateDiscordPresence("Ready — Local g++", ver);
                }
                else
                {
                    hasLocalGcc = false;
                    GccStatus.Text = "❌ No g++ — install MSYS2/CodeBlocks";
                    GccStatus.Foreground = new System.Windows.Media.SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#f85149"));
                }
            }
            catch (Exception ex)
            {
                GccStatus.Text = $"Error checking g++: {ex.Message}";
            }
        }

        private async Task InitWebViewAsync()
        {
            try
            {
                // Ensure WebView2 runtime installed
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "ide.ankb-webview2"));
                await WebView.EnsureCoreWebView2Async(env);

                // Host object for offline compiler
                WebView.CoreWebView2.AddHostObjectToScript("ideAnkbHost", new HostObject(this));

                // Load local public/index.html if exists, else remote https://ide.ankb.qzz.io
                string localIndex = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "public", "index.html");
                // In publish folder, public is at different location, try find index.html
                string[] tryPaths = new string[]
                {
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "public", "index.html"),
                    Path.Combine(Directory.GetCurrentDirectory(), "public", "index.html"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "public", "index.html"),
                    "https://ide.ankb.qzz.io"
                };

                string loadUrl = "https://ide.ankb.qzz.io";
                foreach (var p in tryPaths)
                {
                    if (File.Exists(p))
                    {
                        loadUrl = "file:///" + p.Replace("\\", "/");
                        break;
                    }
                }

                // If local file not found, use remote
                if (loadUrl.StartsWith("file:///"))
                {
                    WebView.Source = new Uri(loadUrl);
                }
                else
                {
                    WebView.Source = new Uri("https://ide.ankb.qzz.io");
                }

                WebView.CoreWebView2.NavigationCompleted += (s, e) =>
                {
                    LoadingOverlay.Visibility = Visibility.Collapsed;
                    // Inject JS to override fetch /api/run to use host object if local g++ mode selected
                    try
                    {
                        string script = @"
                            console.log('[ide.ankb WebView2] Injected offline compiler bridge');
                            window.ideAnkbLocalGcc = {
                                hasGcc: " + (hasLocalGcc ? "true" : "false") + @",
                                gccVersion: '" + gccVersion.Replace("'", "\\'") + @"',
                                compile: async (code, stdin, version) => {
                                    try {
                                        if (window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ideAnkbHost) {
                                            let res = await window.chrome.webview.hostObjects.ideAnkbHost.CompileAndRun(code, stdin || '', version || '23');
                                            return JSON.parse(res);
                                        }
                                    } catch(e) { console.error('Host compile error', e); }
                                    return null;
                                }
                            };
                            // Override fetch for /api/run if compiler selector is local
                            const origFetch = window.fetch;
                            window.fetch = async (url, opts) => {
                                try {
                                    const isApiRun = (typeof url === 'string' && url.includes('/api/run')) || (url && url.pathname && url.pathname.includes('/api/run'));
                                    if (isApiRun) {
                                        const sel = document.getElementById('cppVersion');
                                        // Check if user selected local compiler in host app UI? We'll check a global flag
                                        // For WebView2 host, we will let host app decide via message
                                        let body = null;
                                        if (opts && opts.body) {
                                            try { body = JSON.parse(opts.body); } catch {}
                                        }
                                        // If local g++ mode and host bridge available, try local first
                                        const compilerSel = document.getElementById('cppVersion')?.value || '23';
                                        // Ask host if we should use local
                                        if (window.ideAnkbLocalGcc && window.ideAnkbLocalGcc.hasGcc) {
                                            // Try to get host setting via host object exposed
                                            try {
                                                if (window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ideAnkbHost) {
                                                    const mode = await window.chrome.webview.hostObjects.ideAnkbHost.GetCompilerMode();
                                                    if (mode === 'local' || mode === 'auto') {
                                                        let localRes = await window.ideAnkbLocalGcc.compile(body.code, body.stdin, compilerSel);
                                                        if (localRes) {
                                                            console.log('Using local g++ result', localRes);
                                                            return new Response(JSON.stringify(localRes), { status: 200, headers: { 'Content-Type': 'application/json' } });
                                                        }
                                                    }
                                                }
                                            } catch(e) { console.warn('Local compile check failed, falling back to network', e); }
                                        }
                                    }
                                } catch(e) { console.error('fetch override error', e); }
                                return origFetch(url, opts);
                            };
                        ";
                        WebView.CoreWebView2.ExecuteScriptAsync(script);
                    }
                    catch (Exception ex) { Console.WriteLine($"Inject JS failed: {ex.Message}"); }
                };

                // Handle messages from web
                WebView.CoreWebView2.WebMessageReceived += (s, e) =>
                {
                    try
                    {
                        var msg = e.TryGetWebMessageAsString();
                        Console.WriteLine($"WebView message: {msg}");
                        // Status message from webview
                        try { GccStatus.Text = msg; } catch { }
                        // StatusMsg removed - was causing CS0103
                    }
                    catch { }
                };
            }
            catch (Exception ex)
            {
                MessageBox.Show($"WebView2 initialization failed:\n{ex.Message}\n\nMake sure WebView2 Runtime is installed:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703\n\nError: {ex}", "ide.ankb - WebView2 Error", MessageBoxButton.OK, MessageBoxImage.Error);
                LoadingOverlay.Visibility = Visibility.Collapsed;
                // Fallback to old WPF editor not implemented here, just show error
            }
        }

        private void InitDiscordRpc()
        {
            try
            {
                var clientId = Environment.GetEnvironmentVariable("DISCORD_CLIENT_ID") ?? "1420000000000000000";
                if (string.IsNullOrWhiteSpace(clientId) || clientId == "1420000000000000000") return;
                var rpcType = Type.GetType("Lachee.DiscordRPC.DiscordRpcClient, Lachee.DiscordRPC");
                if (rpcType == null) return;
                discordClient = Activator.CreateInstance(rpcType, clientId);
                var init = rpcType.GetMethod("Initialize");
                init?.Invoke(discordClient, null);
                discordStart = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                UpdateDiscordPresence("Browsing ide.ankb", "WebView2 + Local g++");
            }
            catch { }
        }

        private void UpdateDiscordPresence(string details, string state, string largeKey = "logo", string smallKey = "")
        {
            try
            {
                if (discordClient == null) return;
                var isInit = discordClient.GetType().GetProperty("IsInitialized");
                if (isInit != null && !(bool)isInit.GetValue(discordClient)) return;
                var richType = Type.GetType("Lachee.DiscordRPC.RichPresence, Lachee.DiscordRPC");
                var assetsType = Type.GetType("Lachee.DiscordRPC.Assets, Lachee.DiscordRPC");
                var tsType = Type.GetType("Lachee.DiscordRPC.Timestamps, Lachee.DiscordRPC");
                dynamic presence = Activator.CreateInstance(richType);
                presence.Details = details;
                presence.State = state;
                if (tsType != null)
                {
                    dynamic ts = Activator.CreateInstance(tsType);
                    ts.StartUnixMilliseconds = (ulong)(discordStart * 1000);
                    presence.Timestamps = ts;
                }
                if (assetsType != null)
                {
                    dynamic assets = Activator.CreateInstance(assetsType);
                    assets.LargeImageKey = largeKey;
                    assets.LargeImageText = "ide.ankb WebView2";
                    assets.SmallImageKey = smallKey;
                    presence.Assets = assets;
                }
                var setMethod = discordClient.GetType().GetMethod("SetPresence");
                setMethod?.Invoke(discordClient, new object[] { presence });
            }
            catch { }
        }

        private string ExtractStdFlag(string version)
        {
            return version switch { "11" => "-std=c++11", "14" => "-std=c++14", "17" => "-std=c++17", "20" => "-std=c++20", "23" => "-std=c++23", _ => "-std=c++17" };
        }

        // Called from JS via host object
        public class HostObject
        {
            private MainWindow window;
            public HostObject(MainWindow w) { window = w; }

            public string GetCompilerMode()
            {
                try
                {
                    return window.Dispatcher.Invoke(() =>
                    {
                        if (window.CompilerSelector.SelectedItem is ComboBoxItem item && item.Tag is string tag)
                        {
                            return tag.ToString();
                        }
                        return "auto";
                    });
                }
                catch { return "auto"; }
            }

            public string GetGccVersion()
            {
                return window.gccVersion;
            }

            public bool HasLocalCompiler()
            {
                return window.hasLocalGcc;
            }

            // Compile and run using local g++ - called from JS
            public string CompileAndRun(string code, string stdin, string cppVersion)
            {
                try
                {
                    var tempDir = Path.Combine(Path.GetTempPath(), "ide.ankb-" + Guid.NewGuid().ToString("N").Substring(0, 8));
                    Directory.CreateDirectory(tempDir);
                    var srcPath = Path.Combine(tempDir, "main.cpp");
                    var exePath = Path.Combine(tempDir, "main.exe");
                    if (Environment.OSVersion.Platform != PlatformID.Win32NT) exePath = Path.Combine(tempDir, "main");
                    var inPath = Path.Combine(tempDir, "in.txt");
                    File.WriteAllText(srcPath, code);
                    File.WriteAllText(inPath, stdin ?? "");

                    string stdFlag = cppVersion switch { "11" => "-std=c++11", "14" => "-std=c++14", "17" => "-std=c++17", "20" => "-std=c++20", "23" => "-std=c++23", _ => "-std=c++17" };
                    string gccExe = window.hasLocalGcc && !string.IsNullOrWhiteSpace(window.gccPath) && File.Exists(window.gccPath) ? window.gccPath : "g++";

                    var compilePsi = new ProcessStartInfo(gccExe, $"{stdFlag} -O2 -pipe -o \"{exePath}\" \"{srcPath}\"") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = tempDir };
                    using var compileProc = Process.Start(compilePsi);
                    var compileErr = compileProc.StandardError.ReadToEnd();
                    var compileOut = compileProc.StandardOutput.ReadToEnd();
                    compileProc.WaitForExit(5000);

                    if (compileProc.ExitCode != 0)
                    {
                        try { Directory.Delete(tempDir, true); } catch { }
                        var result = new
                        {
                            success = false,
                            stage = "compile",
                            stdout = compileOut,
                            stderr = compileErr,
                            compile_error = compileErr + compileOut,
                            exit_code = compileProc.ExitCode,
                            mode = "local-g++",
                            compiler = $"g++ {stdFlag}"
                        };
                        return System.Text.Json.JsonSerializer.Serialize(result);
                    }

                    var runPsi = new ProcessStartInfo() { FileName = exePath, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = tempDir };
                    using var runProc = new Process() { StartInfo = runPsi };
                    runProc.Start();
                    if (!string.IsNullOrEmpty(stdin)) runProc.StandardInput.Write(stdin);
                    runProc.StandardInput.Close();
                    var stdout = runProc.StandardOutput.ReadToEnd();
                    var stderr = runProc.StandardError.ReadToEnd();
                    if (!runProc.WaitForExit(2000)) { try { runProc.Kill(); } catch { } }

                    try { Directory.Delete(tempDir, true); } catch { }

                    var runResult = new
                    {
                        success = runProc.ExitCode == 0,
                        stage = "run",
                        stdout = stdout,
                        stderr = stderr,
                        compile_error = "",
                        exit_code = runProc.ExitCode,
                        mode = "local-g++",
                        compiler = $"g++ {stdFlag}",
                        durationMs = 0
                    };
                    return System.Text.Json.JsonSerializer.Serialize(runResult);
                }
                catch (Exception ex)
                {
                    var err = new { success = false, stage = "error", stdout = "", stderr = $"Local g++ failed: {ex.Message}", compile_error = ex.ToString(), exit_code = 500, mode = "local-g++-error" };
                    return System.Text.Json.JsonSerializer.Serialize(err);
                }
            }
        }

        private void OpenFile_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog { Filter = "C++ Files (*.cpp)|*.cpp|All Files|*.*" };
            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var text = File.ReadAllText(dlg.FileName);
                    WebView.CoreWebView2?.ExecuteScriptAsync($"if(window.monaco && window.monaco.editor){{ monaco.editor.getModels()[0].setValue({System.Text.Json.JsonSerializer.Serialize(text)}); }} else {{ localStorage.setItem('ide.ankb:code', {System.Text.Json.JsonSerializer.Serialize(text)}); location.reload(); }}");
                }
                catch (Exception ex) { MessageBox.Show($"Open failed: {ex.Message}"); }
            }
        }

        private void SaveFile_Click(object sender, RoutedEventArgs e)
        {
            WebView.CoreWebView2?.ExecuteScriptAsync("if(window.monaco && window.monaco.editor){ const code=monaco.editor.getModels()[0].getValue(); const blob=new Blob([code],{type:'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='main.cpp'; a.click(); }");
        }

        private void TestCases_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Test Cases feature:\n- Add multiple inputs + expected outputs\n- Run all and compare\n\nComing in v1.5 — for now use stdin and manual check.\n\nIf you enable Test Cases in web version (branch main v10), it will show panel for multiple test cases.", "Test Cases - Coming soon", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void Settings_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Settings:\n- Theme: Dark+, GitHub Dark, Dracula, Nord, Tokyo Night\n- Font, FontSize, TabSize\n- Auto Save, Word Wrap, Minimap, Discord RPC\n\nSet via web version Settings modal (Ctrl+,) or via env vars:\nJUDGE0_API_URL, BACKEND_URL, DISCORD_CLIENT_ID", "Settings", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void Reload_Click(object sender, RoutedEventArgs e)
        {
            WebView?.Reload();
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            try { discordClient?.ClearPresence(); discordClient?.Deinitialize(); discordClient?.Dispose(); } catch { }
        }
    }
}
