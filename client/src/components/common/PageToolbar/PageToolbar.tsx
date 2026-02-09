import React from 'react';
import styles from './PageToolbar.module.css';

interface PageToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const PageToolbar: React.FC<PageToolbarProps> = ({ children, className = '' }) => {
  return (
    <div className={`${styles.toolbar} ${className}`}>
      {children}
    </div>
  );
};

interface ToolbarStartProps {
  children: React.ReactNode;
  className?: string;
}

export const ToolbarStart: React.FC<ToolbarStartProps> = ({ children, className = '' }) => {
  return (
    <div className={`${styles.toolbarStart} ${className}`}>
      {children}
    </div>
  );
};

interface ToolbarEndProps {
  children: React.ReactNode;
  className?: string;
}

export const ToolbarEnd: React.FC<ToolbarEndProps> = ({ children, className = '' }) => {
  return (
    <div className={`${styles.toolbarEnd} ${className}`}>
      {children}
    </div>
  );
};

interface TagFiltersProps {
  tags: string[];
  selectedTag: string;
  onTagSelect: (tag: string) => void;
  className?: string;
}

export const TagFilters: React.FC<TagFiltersProps> = ({ 
  tags, 
  selectedTag, 
  onTagSelect,
  className = '' 
}) => {
  return (
    <div className={`${styles.tagFilters} ${className}`}>
      {tags.map(tag => (
        <button
          key={tag}
          className={`${styles.tagFilter} ${selectedTag === tag ? styles.active : ''}`}
          onClick={() => onTagSelect(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
};

PageToolbar.displayName = 'PageToolbar';
ToolbarStart.displayName = 'ToolbarStart';
ToolbarEnd.displayName = 'ToolbarEnd';
TagFilters.displayName = 'TagFilters';
