// 通道注册表（方案 §4.3）：按 adapter.channel 取通道实现，四种通道共用同一接口。
// 本期只实现 exe（T2-1）；msix（T2-2）/ webview2（T2-3）/ dsh-plugin（T2-4）随后落地，
// 未实现时明确抛错，不静默降级到别的通道。
import { exeChannel } from './exe.mjs';

export function channelFor(adapterOrKind) {
  const kind = typeof adapterOrKind === 'string' ? adapterOrKind : (adapterOrKind && adapterOrKind.channel);
  if (kind === 'exe') return exeChannel;
  throw new Error('通道 ' + (kind || '(未指定)') + ' 尚未实现（当前只支持 exe，见方案 4.3 与工单 T2-2/T2-3/T2-4）');
}

export { exeChannel };
