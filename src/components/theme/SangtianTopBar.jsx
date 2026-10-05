import React, { useState } from 'react';
import { Menu, MoreVertical, Play, Folder, Check, Copy, Palette, Settings, RotateCcw, Heart, ChevronLeft, Film } from 'lucide-react';

export function SangtianTopBar({
  onBack,
  title,
  subTitle,
  onHamburger,
  onPreview,
  previewText = '预览区',
  workspaceText = '工作区 5',
  badgeRed = '8',
  badgeYellow = '9改',
  onWorkspace,
  currentTheme = 'sangtian',
  onSelectTheme,
  onCopyLink,
  onReload,
  onOpenSettings,
  yellowHeart = false,
  isYellowActive = false,
  onYellowClick,
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  const handleCopy = () => {
    if (onCopyLink) {
      onCopyLink();
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
      setShowMoreMenu(false);
    }
  };

  return (
    <header className="sangtian-topbar">
      <div className="sangtian-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onBack && (
          <button
            className="sangtian-icon-btn back-btn"
            aria-label="返回"
            onClick={onBack}
            title="返回上一页"
            style={{ background: '#382c22', borderColor: '#523f31', color: '#ffedd5' }}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <button
          className="sangtian-icon-btn"
          aria-label="打开菜单"
          onClick={onHamburger}
          title="功能菜单"
        >
          <Menu size={20} />
        </button>
        {title && (
          <div className="topbar-movie-title" style={{ display: 'flex', flexDirection: 'column', marginLeft: '4px', maxWidth: '160px', overflow: 'hidden' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fef3c7', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {title}
            </span>
            {subTitle && (
              <span style={{ fontSize: '11px', color: '#9a8c7d', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {subTitle}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="sangtian-topbar-center">
        {previewText && (
          <button
            className="sangtian-pill-btn preview-pill"
            onClick={onPreview}
            title="点击快速换源或预览"
          >
            <Play size={13} fill="#54c46f" color="#54c46f" className="play-triangle" />
            <span>{previewText}</span>
          </button>
        )}

        <button
          className="sangtian-pill-btn workspace-pill"
          onClick={onWorkspace}
          title="线路与工作区"
        >
          <Folder size={14} className="folder-icon" />
          <span>{workspaceText}</span>
          {badgeRed && <span className="sangtian-badge-red">{badgeRed}</span>}
          {badgeYellow && (
            <span
              className={`sangtian-badge-yellow ${yellowHeart ? 'clickable-fav' : ''}`}
              onClick={(e) => {
                if (onYellowClick) {
                  e.stopPropagation();
                  onYellowClick();
                }
              }}
              style={yellowHeart ? { display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer' } : {}}
            >
              <span>{badgeYellow}</span>
              {yellowHeart && (
                <Heart
                  size={11}
                  fill={isYellowActive ? '#e11d48' : 'none'}
                  color={isYellowActive ? '#e11d48' : 'currentColor'}
                  style={{ transition: 'all 0.2s' }}
                />
              )}
            </span>
          )}
        </button>
      </div>

      <div className="sangtian-topbar-right">
        <button
          className="sangtian-icon-btn"
          aria-label="更多操作"
          onClick={() => setShowMoreMenu(v => !v)}
          title="更多选项"
        >
          <MoreVertical size={20} />
        </button>

        {showMoreMenu && (
          <div className="sangtian-dropdown-menu">
            <div className="dropdown-section-title">主题选择</div>
            <div className="theme-options">
              <button
                className={`theme-option ${currentTheme === 'sangtian' ? 'active' : ''}`}
                onClick={() => { onSelectTheme?.('sangtian'); setShowMoreMenu(false); }}
              >
                <span>✦ 桑田山河 (山水纸韵)</span>
                {currentTheme === 'sangtian' && <Check size={14} />}
              </button>
              <button
                className={`theme-option ${currentTheme === 'dark' ? 'active' : ''}`}
                onClick={() => { onSelectTheme?.('dark'); setShowMoreMenu(false); }}
              >
                <span>🌑 极夜深色</span>
                {currentTheme === 'dark' && <Check size={14} />}
              </button>
              <button
                className={`theme-option ${currentTheme === 'light' ? 'active' : ''}`}
                onClick={() => { onSelectTheme?.('light'); setShowMoreMenu(false); }}
              >
                <span>☀️ 素白浅色</span>
                {currentTheme === 'light' && <Check size={14} />}
              </button>
            </div>

            <div className="dropdown-divider" />

            {onCopyLink && (
              <button className="dropdown-item" onClick={handleCopy}>
                <Copy size={15} />
                <span>复制当前播放直链</span>
              </button>
            )}

            {onReload && (
              <button className="dropdown-item" onClick={() => { onReload(); setShowMoreMenu(false); }}>
                <RotateCcw size={15} />
                <span>重新加载当前流</span>
              </button>
            )}

            {onOpenSettings && (
              <button className="dropdown-item" onClick={() => { onOpenSettings(); setShowMoreMenu(false); }}>
                <Settings size={15} />
                <span>偏好与源设置</span>
              </button>
            )}
          </div>
        )}
      </div>

      {copiedToast && (
        <div className="sangtian-toast">
          ✓ 播放链接已复制到剪贴板
        </div>
      )}
    </header>
  );
}
