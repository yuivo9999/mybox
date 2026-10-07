import React from 'react';
import { SangtianPlayerWindowCore } from '../theme/SangtianPlayerConsole.jsx';

/**
 * Live 专属播放器功能区块。
 * 这里是 LiveFeature 对播放器内核的唯一业务入口。
 * “沉浸播放”仍由同一个 core 实例通过 isImmersive 切换展示状态，不创建第二个播放器。
 */
export function LivePlayerBlock({
  isImmersive = false,
  children,
  ...props
}) {
  return (
    <section
      className={'player-feature-block player-feature-block-live' + (isImmersive ? ' player-feature-block-live-immersive' : '')}
      data-player-block="live"
      data-player-mode={isImmersive ? 'immersive' : 'embedded'}
    >
      <SangtianPlayerWindowCore
        {...props}
        isLive
        isImmersive={isImmersive}
        playerScope="live"
      >
        {children}
      </SangtianPlayerWindowCore>
    </section>
  );
}
