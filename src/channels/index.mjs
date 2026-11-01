// 通道注册表（方案 §4.3）：按 adapter.channel 取通道实现，四种通道共用同一接口。
// 已实现 exe（T2-1）、msix（T2-2）、webview2（T2-3）；dsh-plugin（T2-4）随后落地，
// 未实现时明确抛错，不静默降级到别的通道。
import { exeChannel } from './exe.mjs';
import { msixChannel } from './msix.mjs';
import { webview2Channel } from './webview2.mjs';

export function channelFor(adapterOrKind) {
  const kind = typeof adapterOrKind === 'string' ? adapterOrKind : (adapterOrKind && adapterOrKind.channel);
  if (kind === 'exe') return exeChannel;
  if (kind === 'msix') return msixChannel;
  if (kind === 'webview2') return webview2Channel;
  throw new Error('通道 ' + (kind || '(未指定)') + ' 尚未实现（当前支持 exe、msix、webview2，见方案 4.3 与工单 T2-4）');
}

export { exeChannel, msixChannel, webview2Channel };
