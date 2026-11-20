package com.hydrolog.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.text.InputType
import android.util.Base64
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
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
    private var hasMainFrameError = false

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

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = pendingFilePathCallback
        pendingFilePathCallback = null

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

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        launchMediaChooser(includeCamera = granted)
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
            userAgentString = "$userAgentString HydroLogAndroid/${BuildConfig.VERSION_NAME}"
        }

        webView.addJavascriptInterface(HydroLogAndroidBridge(), "HydroLogAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                val targetHost = uri.host.orEmpty()
                if (targetHost.equals(getActiveHost(), ignoreCase = true) || uri.scheme == "blob") {
                    return false
                }
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: Exception) {
                    false
                }
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

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                pendingFilePathCallback?.onReceiveValue(null)
                pendingFilePathCallback = filePathCallback

                val hasCameraPermission = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED

                if (hasCameraPermission) {
                    launchMediaChooser(includeCamera = true)
                } else {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
                return true
            }
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
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = null
        webView.destroy()
        super.onDestroy()
    }

    inner class HydroLogAndroidBridge {
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
