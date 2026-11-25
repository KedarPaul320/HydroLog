package com.hydrolog.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.MediaStore
import android.provider.Settings
import android.text.InputType
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.material.button.MaterialButton
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineContainer: LinearLayout
    private lateinit var offlineTitle: TextView
    private lateinit var offlineMessage: TextView
    private lateinit var currentUrlLabel: TextView

    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraPhotoUri: Uri? = null
    private var pendingCaptureOnly = false
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var hasMainFrameError = false
    private var popupDialog: Dialog? = null
    private var popupWebView: WebView? = null

    private val prefs by lazy {
        getSharedPreferences("hydrolog_prefs", MODE_PRIVATE)
    }

    private fun getActiveAppUrl(): String {
        val saved = prefs.getString("custom_app_url", null)?.trim()
        return if (!saved.isNullOrEmpty()) saved else BuildConfig.APP_URL
    }

    private fun getActiveHost(): String {
        return Uri.parse(getActiveAppUrl()).host.orEmpty()
    }

    private fun sanitizeUserAgentForOAuth(rawUa: String): String {
        return rawUa
            .replace("; wv)", ")")
            .replace(Regex("\\bVersion/\\d+\\.\\d+\\s*"), "")
            .trim()
    }

    private fun isExternalGoogleSheetsUri(uri: Uri): Boolean {
        val host = uri.host.orEmpty().lowercase()
        return host == "docs.google.com" || host == "sheets.google.com"
    }

    private fun isOAuthOrAppHost(uri: Uri): Boolean {
        if (isExternalGoogleSheetsUri(uri)) return false
        val host = uri.host.orEmpty().lowercase()
        val activeHost = getActiveHost().lowercase()
        return host == activeHost ||
            (host.endsWith(".run.app") && host.contains("hydrolog")) ||
            host == "accounts.google.com" ||
            host.startsWith("accounts.google.") ||
            host == "accounts.youtube.com" ||
            host == "apis.google.com" ||
            host == "gds.google.com" ||
            host == "myaccount.google.com" ||
            host.endsWith(".firebaseapp.com") ||
            host.endsWith(".web.app") ||
            host.endsWith(".googleapis.com")
    }

    private fun openExternalUrlSafe(rawUrl: String): Boolean {
        val trimmed = rawUrl.trim()
        val uri = Uri.parse(trimmed)
        val scheme = uri.scheme?.lowercase().orEmpty()
        if (scheme != "https" && scheme != "http") {
            return false
        }
        return try {
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
            }
            startActivity(intent)
            true
        } catch (_: Exception) {
            Toast.makeText(
                this,
                "No app or browser found to open this link.",
                Toast.LENGTH_LONG
            ).show()
            false
        }
    }

    private fun closePopupWindow() {
        val currentPopup = popupWebView
        popupWebView = null
        val currentDialog = popupDialog
        popupDialog = null
        try {
            currentDialog?.dismiss()
        } catch (_: Exception) {
            // Dialog may already be detached
        }
        try {
            currentPopup?.stopLoading()
            (currentPopup?.parent as? ViewGroup)?.removeView(currentPopup)
            currentPopup?.destroy()
        } catch (_: Exception) {
            // Popup WebView already destroyed
        }
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = pendingFilePathCallback
        pendingFilePathCallback = null
        pendingCaptureOnly = false

        if (callback == null) {
            pendingCameraPhotoUri = null
            return@registerForActivityResult
        }

        if (result.resultCode != Activity.RESULT_OK) {
            pendingCameraPhotoUri = null
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }

        val data = result.data
        val selectedUris = when {
            data?.clipData != null -> {
                val clip = data.clipData!!
                Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
            }
            data?.data != null -> arrayOf(data.data!!)
            pendingCameraPhotoUri != null -> arrayOf(pendingCameraPhotoUri!!)
            else -> null
        }

        pendingCameraPhotoUri = null
        callback.onReceiveValue(selectedUris)
    }

    // Native Android CAMERA permission dialog for file chooser / direct camera capture
    private val fileCameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (pendingCaptureOnly) {
            if (granted) {
                launchDirectCamera()
            } else {
                pendingCaptureOnly = false
                pendingFilePathCallback?.onReceiveValue(null)
                pendingFilePathCallback = null
                handleCameraPermissionDenied()
            }
        } else {
            launchMediaChooser(includeCamera = granted)
        }
    }

    // Native Android CAMERA permission dialog for WebView getUserMedia ("Open Camera")
    private val webCameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingWebPermissionRequest
        pendingWebPermissionRequest = null
        if (request == null) return@registerForActivityResult

        if (granted) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        } else {
            request.deny()
            handleCameraPermissionDenied()
        }
    }

    private fun handleCameraPermissionDenied() {
        val canAskAgain = shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)
        if (!canAskAgain) {
            AlertDialog.Builder(this)
                .setTitle("Camera Permission Required")
                .setMessage(
                    "Camera access is currently turned off for HydroLog. Open App Settings to allow Camera so you can capture meter photos automatically."
                )
                .setPositiveButton("Open Settings") { _, _ ->
                    openAppSettingsScreen()
                }
                .setNegativeButton("Cancel", null)
                .show()
        } else {
            Toast.makeText(
                this,
                "Camera permission is required to open the camera.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun openAppSettingsScreen() {
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", packageName, null)
            )
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "Open Android Settings to allow Camera access.", Toast.LENGTH_LONG)
                .show()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        offlineContainer = findViewById(R.id.offlineContainer)
        offlineTitle = findViewById(R.id.offlineTitle)
        offlineMessage = findViewById(R.id.offlineMessage)
        currentUrlLabel = findViewById(R.id.currentUrlLabel)
        val retryButton: MaterialButton = findViewById(R.id.retryButton)
        val changeUrlButton: MaterialButton = findViewById(R.id.changeUrlButton)

        retryButton.setOnClickListener {
            loadActiveServer()
        }

        changeUrlButton.setOnClickListener {
            showServerUrlDialog()
        }

        configureWebView()
        setupBackNavigation()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadActiveServer()
        }
    }

    private fun loadActiveServer() {
        val url = getActiveAppUrl()
        hasMainFrameError = false
        currentUrlLabel.text = url
        offlineContainer.visibility = View.GONE
        webView.visibility = View.VISIBLE
        // Clear HTTP cache so republished web updates load immediately while keeping
        // IndexedDB/localStorage intact for persistent Firebase Auth sessions.
        webView.clearCache(true)
        webView.loadUrl(url)
    }

    private fun showRecoveryScreen(title: String, message: String) {
        hasMainFrameError = true
        progressBar.visibility = View.GONE
        webView.visibility = View.GONE
        offlineTitle.text = title
        offlineMessage.text = message
        currentUrlLabel.text = getActiveAppUrl()
        offlineContainer.visibility = View.VISIBLE
    }

    private fun showServerUrlDialog() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(getActiveAppUrl())
            setSelection(text.length)
            hint = "https://your-hydrolog-url.run.app"
            setPadding(48, 32, 48, 32)
        }

        AlertDialog.Builder(this)
            .setTitle("HydroLog Server URL")
            .setMessage("Enter the deployed HTTPS URL of your HydroLog server:")
            .setView(input)
            .setPositiveButton("Save & Connect") { _, _ ->
                val raw = input.text.toString().trim()
                if (raw.startsWith("https://") || raw.startsWith("http://")) {
                    prefs.edit().putString("custom_app_url", raw).apply()
                    loadActiveServer()
                } else {
                    Toast.makeText(
                        this,
                        "Enter a valid URL starting with https://",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            .setNeutralButton("Reset Default") { _, _ ->
                prefs.edit().remove("custom_app_url").apply()
                loadActiveServer()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            val cleanUa = sanitizeUserAgentForOAuth(userAgentString)
            userAgentString = "$cleanUa HydroLogAndroid/${BuildConfig.VERSION_NAME}"
        }

        webView.addJavascriptInterface(HydroLogAndroidBridge(), "HydroLogAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                if (isExternalGoogleSheetsUri(uri)) {
                    return openExternalUrlSafe(uri.toString())
                }
                val targetHost = uri.host.orEmpty()
                val isSameHost = targetHost.equals(getActiveHost(), ignoreCase = true)
                val isHydroLogAppHost =
                    targetHost.endsWith(".run.app", ignoreCase = true) &&
                        targetHost.contains("hydrolog", ignoreCase = true)
                if (isSameHost || isHydroLogAppHost || uri.scheme == "blob") {
                    return false
                }
                return openExternalUrlSafe(uri.toString())
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                hasMainFrameError = false
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                if (!hasMainFrameError) {
                    offlineContainer.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    showRecoveryScreen(
                        getString(R.string.offline_title),
                        getString(R.string.offline_message)
                    )
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                val status = errorResponse?.statusCode ?: return
                if (request?.isForMainFrame == true && status >= 400) {
                    showRecoveryScreen(
                        "Server returned HTTP $status",
                        "Make sure your HydroLog app is deployed or published publicly, or tap Change Server URL to connect to your deployed Cloud Run / web URL."
                    )
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread {
                    val wantsVideo =
                        request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    if (!wantsVideo) {
                        request.deny()
                        return@runOnUiThread
                    }

                    val hasCameraPermission = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED

                    if (hasCameraPermission) {
                        // Already granted previously — open camera automatically
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        // First time — pop up Android's native Camera permission dialog
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        webCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                if (pendingWebPermissionRequest == request) {
                    pendingWebPermissionRequest = null
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                pendingFilePathCallback?.onReceiveValue(null)
                pendingFilePathCallback = filePathCallback
                pendingCaptureOnly = fileChooserParams?.isCaptureEnabled == true

                val hasCameraPermission = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED

                if (pendingCaptureOnly) {
                    if (hasCameraPermission) {
                        launchDirectCamera()
                    } else {
                        fileCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                } else {
                    launchMediaChooser(includeCamera = hasCameraPermission)
                }
                return true
            }

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false

                closePopupWindow()

                val childWebView = WebView(this@MainActivity).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        javaScriptCanOpenWindowsAutomatically = true
                        setSupportMultipleWindows(false)
                        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        userAgentString = sanitizeUserAgentForOAuth(userAgentString)
                    }
                }

                CookieManager.getInstance().setAcceptThirdPartyCookies(childWebView, true)

                val dialog = Dialog(this@MainActivity, android.R.style.Theme_DeviceDefault_Light_NoActionBar).apply {
                    requestWindowFeature(Window.FEATURE_NO_TITLE)
                    setContentView(childWebView)
                    setCancelable(true)
                    setOnDismissListener {
                        if (popupDialog === this) {
                            closePopupWindow()
                        }
                    }
                }

                childWebView.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        popup: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        val uri = request?.url ?: return false
                        if (isExternalGoogleSheetsUri(uri) || !isOAuthOrAppHost(uri)) {
                            openExternalUrlSafe(uri.toString())
                            closePopupWindow()
                            return true
                        }
                        return false
                    }

                    override fun onPageStarted(popup: WebView?, url: String?, favicon: Bitmap?) {
                        super.onPageStarted(popup, url, favicon)
                        if (url.isNullOrBlank() || url == "about:blank") return
                        val uri = Uri.parse(url)
                        if (isExternalGoogleSheetsUri(uri) || !isOAuthOrAppHost(uri)) {
                            popup?.stopLoading()
                            openExternalUrlSafe(url)
                            closePopupWindow()
                        }
                    }
                }

                childWebView.webChromeClient = object : WebChromeClient() {
                    override fun onCloseWindow(window: WebView?) {
                        runOnUiThread {
                            closePopupWindow()
                        }
                    }
                }

                popupWebView = childWebView
                popupDialog = dialog
                dialog.show()

                transport.webView = childWebView
                resultMsg.sendToTarget()
                return true
            }

            override fun onCloseWindow(window: WebView?) {
                runOnUiThread {
                    closePopupWindow()
                }
            }
        }
    }

    private fun launchDirectCamera() {
        val cameraIntent = createCameraIntent()
        if (cameraIntent == null) {
            pendingCaptureOnly = false
            launchMediaChooser(includeCamera = false)
            return
        }
        try {
            fileChooserLauncher.launch(cameraIntent)
        } catch (_: Exception) {
            pendingCaptureOnly = false
            pendingFilePathCallback?.onReceiveValue(null)
            pendingFilePathCallback = null
            pendingCameraPhotoUri = null
            Toast.makeText(this, "Unable to open camera.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun launchMediaChooser(includeCamera: Boolean) {
        val contentIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
        }

        val initialIntents = mutableListOf<Intent>()
        if (includeCamera) {
            createCameraIntent()?.let { initialIntents.add(it) }
        }

        val chooser = Intent(Intent.ACTION_CHOOSER).apply {
            putExtra(Intent.EXTRA_INTENT, contentIntent)
            putExtra(Intent.EXTRA_TITLE, "Capture or select meter photo")
            if (initialIntents.isNotEmpty()) {
                putExtra(Intent.EXTRA_INITIAL_INTENTS, initialIntents.toTypedArray())
            }
        }

        try {
            fileChooserLauncher.launch(chooser)
        } catch (_: Exception) {
            pendingFilePathCallback?.onReceiveValue(null)
            pendingFilePathCallback = null
            pendingCameraPhotoUri = null
            Toast.makeText(this, "Unable to open camera or gallery.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun createCameraIntent(): Intent? {
        return try {
            val cameraDir = File(cacheDir, "camera").apply {
                if (!exists()) mkdirs()
            }
            val photoFile = File.createTempFile("meter_", ".jpg", cameraDir)
            val photoUri = FileProvider.getUriForFile(
                this,
                "${BuildConfig.APPLICATION_ID}.fileprovider",
                photoFile
            )
            pendingCameraPhotoUri = photoUri
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } catch (_: Exception) {
            pendingCameraPhotoUri = null
            null
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        closePopupWindow()
        pendingWebPermissionRequest?.deny()
        pendingWebPermissionRequest = null
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = null
        webView.destroy()
        super.onDestroy()
    }

    inner class HydroLogAndroidBridge {
        @JavascriptInterface
        fun getAppVersion(): String {
            return BuildConfig.VERSION_NAME
        }

        @JavascriptInterface
        fun hasCameraPermission(): Boolean {
            return ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        }

        @JavascriptInterface
        fun openAppSettings() {
            runOnUiThread {
                openAppSettingsScreen()
            }
        }

        @JavascriptInterface
        fun openExternalUrl(url: String): Boolean {
            val trimmed = url.trim()
            val scheme = Uri.parse(trimmed).scheme?.lowercase().orEmpty()
            if (scheme != "https" && scheme != "http") {
                return false
            }
            runOnUiThread {
                openExternalUrlSafe(trimmed)
            }
            return true
        }

        @JavascriptInterface
        fun saveBase64File(base64Data: String, rawFilename: String, mimeType: String): Boolean {
            val safeName = rawFilename
                .trim()
                .replace(Regex("[^a-zA-Z0-9._-]"), "_")
                .ifEmpty { "water-meter-readings.xlsx" }

            return try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: return false
                    contentResolver.openOutputStream(uri)?.use { out ->
                        out.write(bytes)
                        out.flush()
                    } ?: return false
                } else {
                    @Suppress("DEPRECATION")
                    val downloadsDir =
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!downloadsDir.exists()) downloadsDir.mkdirs()
                    val file = File(downloadsDir, safeName)
                    FileOutputStream(file).use { out ->
                        out.write(bytes)
                        out.flush()
                    }
                }

                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "Saved $safeName to Downloads",
                        Toast.LENGTH_LONG
                    ).show()
                }
                true
            } catch (_: Exception) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "Could not save $safeName to Downloads",
                        Toast.LENGTH_LONG
                    ).show()
                }
                false
            }
        }
    }
}
