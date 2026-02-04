import { useState, useEffect, useCallback } from 'react';

// 主题类型
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system'
};

// 获取系统偏好主题
const getSystemTheme = () => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// 从 localStorage 获取保存的主题
const getSavedTheme = () => {
    if (typeof window === 'undefined') return THEMES.SYSTEM;
    return localStorage.getItem('theme') || THEMES.SYSTEM;
};

// 主题 Hook
export const useTheme = () => {
    const [theme, setThemeState] = useState(getSavedTheme);
    const [resolvedTheme, setResolvedTheme] = useState('dark');

    // 应用主题到 DOM
    const applyTheme = useCallback((newTheme) => {
        const resolved = newTheme === THEMES.SYSTEM ? getSystemTheme() : newTheme;
        setResolvedTheme(resolved);

        // 更新 html class
        if (resolved === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    // 设置主题并保存到 localStorage
    const setTheme = useCallback((newTheme) => {
        setThemeState(newTheme);
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }, [applyTheme]);

    // 初始化和监听系统主题变化
    useEffect(() => {
        applyTheme(theme);

        // 监听系统主题变化
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === THEMES.SYSTEM) {
                applyTheme(THEMES.SYSTEM);
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, applyTheme]);

    // 循环切换主题: system -> light -> dark -> system
    const cycleTheme = useCallback(() => {
        const order = [THEMES.SYSTEM, THEMES.LIGHT, THEMES.DARK];
        const currentIndex = order.indexOf(theme);
        const nextIndex = (currentIndex + 1) % order.length;
        setTheme(order[nextIndex]);
    }, [theme, setTheme]);

    return {
        theme,           // 当前设置: 'light' | 'dark' | 'system'
        resolvedTheme,   // 实际应用的主题: 'light' | 'dark'
        setTheme,        // 设置主题
        cycleTheme,      // 循环切换
        THEMES           // 主题常量
    };
};

export { THEMES };
