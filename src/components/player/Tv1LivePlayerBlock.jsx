import React from 'react';
import { SangtianPlayerWindowCore } from '../theme/SangtianPlayerConsole.jsx';

/**
 * TV1 专属播放器功能区块。
 * TV1 当前使用自身的 Hls.js 生命周期，不进入统一 playbackController。
 * 因此它必须拥有独立的业务入口与 scope，避免与 Live / PlaybackPage 混用。
 */
export function Tv1LivePlayerBlock({
  children,
  ...props
}) {
  return (
    <section
      className="player-feature-block player-feature-block-tv1-live"
      data-player-block="tv1-live"
    >
      <SangtianPlayerWindowCore
        {...props}
        isLive
        playerScope="tv1-live"
      >
        {children}
      </SangtianPlayerWindowCore>
    </section>
  );
}
