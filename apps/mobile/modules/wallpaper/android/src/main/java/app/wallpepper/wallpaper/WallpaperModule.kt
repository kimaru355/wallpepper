package app.wallpepper.wallpaper

import android.app.WallpaperManager
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream

/**
 * Sets the Android home screen and/or lock screen wallpaper from a local image file.
 * target: "home" | "lock" | "both"
 */
class WallpaperModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Wallpaper")

    AsyncFunction("isSupported") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val wm = WallpaperManager.getInstance(context)
      wm.isWallpaperSupported && wm.isSetWallpaperAllowed
    }

    // Runs off the main thread (AsyncFunction default).
    AsyncFunction("setWallpaper") { fileUri: String, target: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)
      val path = Uri.parse(fileUri).path
        ?: throw CodedException("ERR_BAD_URI", "Invalid file uri: $fileUri", null)
      val file = File(path)
      if (!file.exists()) throw CodedException("ERR_NO_FILE", "File not found: $path", null)

      val wm = WallpaperManager.getInstance(context)
      if (!wm.isWallpaperSupported || !wm.isSetWallpaperAllowed) {
        throw CodedException("ERR_NOT_ALLOWED", "Changing the wallpaper is not allowed on this device", null)
      }
      val flags = when (target) {
        "home" -> WallpaperManager.FLAG_SYSTEM
        "lock" -> WallpaperManager.FLAG_LOCK
        "both" -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
        else -> throw CodedException("ERR_BAD_TARGET", "Unknown target: $target", null)
      }
      try {
        FileInputStream(file).use { wm.setStream(it, null, true, flags) }
      } catch (e: Exception) {
        throw CodedException("ERR_SET_WALLPAPER", e.message ?: "Could not set wallpaper", e)
      }
    }
  }
}
