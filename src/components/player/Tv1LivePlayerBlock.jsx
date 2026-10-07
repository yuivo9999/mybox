import React from 'react';
import { SangtianPlayerWindowCore } from '../theme/SangtianPlayerConsole.jsx';

/**
 * TV1 专属播放器功能区块。
 * 实际播放生命周期统一交给 playbackController；这里仅保留 TV1 的
 * DOM/scope 隔离，避免 Live 与 TV1 的业务状态互相污染。
 * “沉浸播放”也只切换当前播放器的展示层，不重建播放连接。
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
