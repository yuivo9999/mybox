import React from 'react';
import { SangtianPlayerWindowCore } from '../theme/SangtianPlayerConsole.jsx';

/**
 * PlaybackPage/VOD 专属播放器功能区块。
 * 与 Live 播放器使用不同的业务入口、DOM 命名空间和 scope。
 */
export function PlaybackPagePlayerBlock({
  children,
  ...props
}) {
  return (
    <section
      className="player-feature-block player-feature-block-playback"
      data-player-block="playback-page"
    >
      <SangtianPlayerWindowCore
        {...props}
        playerScope="playback-page"
      >
        {children}
      </SangtianPlayerWindowCore>
    </section>
  );
}
