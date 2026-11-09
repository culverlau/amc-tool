/**
 * AMC serves posters from Cloudinary, and some are uploaded as raw originals
 * (we've seen 175-230 MB PNGs) that freeze the browser. Cloudinary resizes on
 * the fly when transformation params are the first path segment, so request a
 * small, re-encoded version instead of the original. For files too big for
 * Cloudinary to transform it answers 423, which trips the <img> onError and
 * shows the text placeholder — the original is never downloaded.
 *
 * Non-Cloudinary / empty URLs pass through unchanged.
 */
const CLOUDINARY_HOST = 'amc-theatres-res.cloudinary.com'

export function posterUrl(url, width = 300) {
  if (!url) return url
  try {
    const u = new URL(url)
    if (u.hostname !== CLOUDINARY_HOST) return url
    // Already transformed (first segment isn't a version like "v123...")
    if (!/^\/v\d+\//.test(u.pathname)) return url
    return `${u.origin}/w_${width},c_limit,f_auto,q_auto${u.pathname}`
  } catch {
    return url
  }
}
