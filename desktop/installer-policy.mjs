// Build-time guard only; no updater or network requests are added to the app.
export function assertInstallerVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      version.split('.').some(part => Number(part) > 65535)) {
    throw new Error('安装版必须使用三段数字版本（每段 0–65535），暂不接受预发布/构建后缀，以免错误判断升级与降级。');
  }
}

export default function beforePack(context) {
  assertInstallerVersion(context.packager.appInfo.version);
}
