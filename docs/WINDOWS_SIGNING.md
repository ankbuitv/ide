# Windows signing và “Unknown publisher”

Windows chỉ bỏ cảnh báo **Unknown publisher** khi file `.exe`/`.msi` được ký bằng một chứng thư code-signing mà máy người dùng tin cậy. Chỉ đổi trường `publisher` trong cấu hình, đổi icon hoặc dùng chứng thư tự ký **không** thể bỏ cảnh báo này trên máy khác.

## Thiết lập GitHub Actions

1. Mua/cấp chứng thư **Windows Code Signing** từ CA tin cậy. Nếu nhà cung cấp cho file `.pfx`, export nó kèm private key và password.
2. Chuyển PFX sang Base64 (không commit file PFX vào repository):

   **PowerShell**

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Set-Clipboard
   ```

   **Linux/macOS**

   ```bash
   base64 < certificate.pfx | tr -d '\n'
   ```

3. Trong GitHub repository, mở **Settings → Secrets and variables → Actions** và tạo:
   - `WINDOWS_CERTIFICATE_BASE64`: chuỗi Base64 ở bước trên.
   - `WINDOWS_CERTIFICATE_PASSWORD`: password của PFX.
4. Chạy workflow `Build & Release CP IDE` hoặc tạo tag release mới.

Workflow sẽ import chứng thư tạm thời vào certificate store của runner và đưa thumbprint vào cấu hình Tauri. Tauri ký app, NSIS installer và MSI bằng SHA-256, kèm timestamp DigiCert. File PFX tạm được xóa trước khi build tiếp tục.

Nếu không có hai secret trên, workflow vẫn build để tiện thử nghiệm nhưng ghi warning và bản Windows vẫn hiện **Unknown publisher**.

## Kiểm tra bản phát hành

Trên Windows:

```powershell
Get-AuthenticodeSignature .\CP-IDE_x64-setup.exe | Format-List Status,StatusMessage,SignerCertificate
```

`Status` phải là `Valid`. Tên Publisher trong UAC/SmartScreen lấy từ Subject của chứng thư, không lấy từ `bundle.publisher`.

> Code signing loại bỏ “Unknown publisher”, nhưng một chứng thư mới vẫn có thể tạm thời gặp màn hình SmartScreen “Windows protected your PC” cho đến khi có đủ reputation. EV code signing hoặc Microsoft Trusted Signing thường tạo độ tin cậy nhanh hơn.
