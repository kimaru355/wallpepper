package app.wallpepper.wallpaper

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.PowerManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.FileInputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Sets the Android home screen and/or lock screen wallpaper from a local image file.
 * target: "home" | "lock" | "both"
 * fit:    "fill" (system default: cover + crop) | "fit" | "blur" (whole image over a blurred copy) | "stretch" | "center"
 * crop:   optional "x,y,w,h" (fractions of the image): only that part of the image is used, filling the screen
 */
class WallpaperModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Wallpaper")

    // Status/navigation bar sizes in dp, so the edge-to-edge UI can pad itself without a native safe-area library.
    Function("getSystemInsets") {
      val activity = appContext.currentActivity
      val decor = activity?.window?.decorView
      val insets = decor?.let { ViewCompat.getRootWindowInsets(it) }
        ?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = (activity?.resources?.displayMetrics?.density ?: 1f).toDouble()
      mapOf(
        "top" to (insets?.top ?: 0) / density,
        "bottom" to (insets?.bottom ?: 0) / density,
        "left" to (insets?.left ?: 0) / density,
        "right" to (insets?.right ?: 0) / density,
      )
    }

    // True when the user already exempted Wallpepper from battery optimisation (background work runs on time).
    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    AsyncFunction("isSupported") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val wm = WallpaperManager.getInstance(context)
      wm.isWallpaperSupported && wm.isSetWallpaperAllowed
    }

    // Runs off the main thread (AsyncFunction default).
    // Renders the image the way setWallpaper would (crop / blur / fit) and saves it as a JPEG, for folder (gallery) mode.
    AsyncFunction("renderToFile") { fileUri: String, fit: String?, crop: String?, name: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)
      val path = Uri.parse(fileUri).path ?: throw CodedException("ERR_BAD_URI", "Invalid file uri: $fileUri", null)
      val file = File(path)
      if (!file.exists()) throw CodedException("ERR_NO_FILE", "File not found: $path", null)
      val bmp = compose(context, file, fit ?: "fill", parseCrop(crop))
      val dir = File(context.cacheDir, "rendered").apply { mkdirs() }
      val out = File(dir, name.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".jpg")
      FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
      bmp.recycle()
      Uri.fromFile(out).toString()
    }

    AsyncFunction("setWallpaper") { fileUri: String, target: String, fit: String?, crop: String? ->
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
        val cropRect = parseCrop(crop)
        if (cropRect != null || fit == "fit" || fit == "stretch" || fit == "center" || fit == "blur") {
          wm.setBitmap(compose(context, file, fit ?: "fill", cropRect), null, true, flags)
        } else {
          // "fill": hand the file to the system, which covers the screen and crops the overflow
          FileInputStream(file).use { wm.setStream(it, null, true, flags) }
        }
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw CodedException("ERR_SET_WALLPAPER", e.message ?: "Could not set wallpaper", e)
      }
    }
  }

  /** "x,y,w,h" as fractions of the image, or null when absent / invalid. */
  private fun parseCrop(s: String?): RectF? {
    val p = s?.split(",")?.mapNotNull { it.trim().toFloatOrNull() } ?: return null
    if (p.size != 4 || p[2] < 0.02f || p[3] < 0.02f) return null
    val x = p[0].coerceIn(0f, 1f)
    val y = p[1].coerceIn(0f, 1f)
    return RectF(x, y, min(1f, x + p[2]), min(1f, y + p[3]))
  }

  /** Draws the image onto a screen sized canvas the way [fit] (and an optional crop) asks for. */
  private fun compose(context: Context, file: File, fit: String, crop: RectF?): Bitmap {
    val metrics = context.resources.displayMetrics
    val sw = metrics.widthPixels
    val sh = metrics.heightPixels

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw CodedException("ERR_DECODE", "The image could not be read", null)
    // Decode no larger than needed, but keep enough pixels for the cropped part.
    val usedW = bounds.outWidth * (crop?.width() ?: 1f)
    val usedH = bounds.outHeight * (crop?.height() ?: 1f)
    var sample = 1
    while (usedW / (sample * 2) >= sw && usedH / (sample * 2) >= sh) sample *= 2
    var src = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: throw CodedException("ERR_DECODE", "The image could not be read", null)

    var mode = fit
    if (crop != null) {
      val x = (crop.left * src.width).toInt().coerceIn(0, src.width - 1)
      val y = (crop.top * src.height).toInt().coerceIn(0, src.height - 1)
      val w = (crop.width() * src.width).toInt().coerceIn(1, src.width - x)
      val h = (crop.height() * src.height).toInt().coerceIn(1, src.height - y)
      val part = Bitmap.createBitmap(src, x, y, w, h)
      if (part !== src) src.recycle()
      src = part
      mode = "fill" // the chosen region fills the screen
    }

    val out = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.BLACK)
    val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    val iw = src.width.toFloat()
    val ih = src.height.toFloat()
    val scaleSample = if (crop == null) sample.toFloat() else 1f

    fun centered(scale: Float): RectF {
      val w = iw * scale
      val h = ih * scale
      return RectF((sw - w) / 2f, (sh - h) / 2f, (sw + w) / 2f, (sh + h) / 2f)
    }

    when (mode) {
      "stretch" -> canvas.drawBitmap(src, null, RectF(0f, 0f, sw.toFloat(), sh.toFloat()), paint)
      "center" -> canvas.drawBitmap(src, null, centered(scaleSample), paint)
      "fill" -> canvas.drawBitmap(src, null, centered(max(sw / iw, sh / ih)), paint)
      "blur" -> {
        // background: the image covering the screen, shrunk a lot and stretched back = a soft blur, then darkened
        val tw = max(1, sw / 24)
        val th = max(1, sh / 24)
        val small = Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888)
        val sc = max(tw / iw, th / ih)
        val sw2 = iw * sc
        val sh2 = ih * sc
        Canvas(small).drawBitmap(src, null, RectF((tw - sw2) / 2f, (th - sh2) / 2f, (tw + sw2) / 2f, (th + sh2) / 2f), paint)
        canvas.drawBitmap(small, null, RectF(0f, 0f, sw.toFloat(), sh.toFloat()), paint)
        small.recycle()
        canvas.drawColor(Color.argb(70, 0, 0, 0))
        canvas.drawBitmap(src, null, centered(min(sw / iw, sh / ih)), paint)
      }
      else -> canvas.drawBitmap(src, null, centered(min(sw / iw, sh / ih)), paint) // "fit"
    }
    src.recycle()
    return out
  }
}
