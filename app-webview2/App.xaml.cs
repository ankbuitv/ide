using System.Windows;

namespace IdeAnkb.WebView2
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            AppDomain.CurrentDomain.UnhandledException += (s, ex) =>
            {
                MessageBox.Show($"Crash: {ex.ExceptionObject}\n\nCheck WebView2 runtime installed: https://go.microsoft.com/fwlink/p/?LinkId=2124703", "ide.ankb Crash", MessageBoxButton.OK, MessageBoxImage.Error);
            };
        }
    }
}
