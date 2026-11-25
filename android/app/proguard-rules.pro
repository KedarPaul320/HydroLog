# Preserve HydroLog WebView JavascriptInterface bridge methods
-keepclassmembers class com.hydrolog.app.MainActivity$HydroLogAndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*
