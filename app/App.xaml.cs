using System.Windows;
using System.Windows.Threading;

namespace IdeAnkb
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            // Global exception handlers to show why app doesn't open
            AppDomain.CurrentDomain.UnhandledException += (s, ex) =>
            {
                try { MessageBox.Show($"Unhandled exception: {ex.ExceptionObject}\n\nCheck g++ installed, logo files exist, .NET 10 runtime included.", "ide.ankb - Crash", MessageBoxButton.OK, MessageBoxImage.Error); } catch { }
            };
            DispatcherUnhandledException += (s, ex) =>
            {
                try { MessageBox.Show($"UI exception: {ex.Exception}\n\nIf this is about logo.png or icon, ensure logo.png/logo.ico are embedded resources.\n\n{ex.Exception.Message}", "ide.ankb - UI Crash", MessageBoxButton.OK, MessageBoxImage.Error); } catch { }
                ex.Handled = true;
            };
            base.OnStartup(e);
        }
    }
}

