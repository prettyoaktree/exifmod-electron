import path from 'node:path'
import { notarize } from '@electron/notarize'

/** electron-builder afterSign — notarize when App Store Connect API key env is set (`mac.notarize` is false to avoid double submission). */
export default async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const appleApiKey = process.env.APPLE_API_KEY
  const appleApiKeyId = process.env.APPLE_API_KEY_ID
  const appleApiIssuer = process.env.APPLE_API_ISSUER

  if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
    console.info(
      '[afterSign] Skipping notarization (set APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER to enable)'
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.info(`[afterSign] Notarizing ${appPath}…`)

  await notarize({
    appPath,
    appleApiKey: path.isAbsolute(appleApiKey) ? appleApiKey : path.resolve(appleApiKey),
    appleApiKeyId,
    appleApiIssuer
  })

  console.info('[afterSign] Notarization finished')
}
