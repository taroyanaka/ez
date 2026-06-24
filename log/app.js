// Chart.js version used: 4.5.1
document.addEventListener('DOMContentLoaded', () => {
    // 1. Fetch Stats from LocalStorage
    function getStats() {
        try {
            const raw = localStorage.getItem('ez_activity_logs');
            if (raw) {
                let parsed = JSON.parse(raw);
                if (parsed.play && typeof parsed.play.duration === 'number') {
                    parsed = { global: parsed };
                    localStorage.setItem('ez_activity_logs', JSON.stringify(parsed));
                }
                return parsed;
            }
        } catch (e) {
            console.error('Error reading logs:', e);
        }
        return {};
    }

    function getStatsForService(serviceKey) {
        const stats = getStats();
        const defaultServiceStats = { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } };
        let result = { play: { ...defaultServiceStats.play }, edit: { ...defaultServiceStats.edit }, daily: {} };
        if (stats[serviceKey]) {
            result.play = { ...defaultServiceStats.play, ...stats[serviceKey].play };
            result.edit = { ...defaultServiceStats.edit, ...stats[serviceKey].edit };
        }
        if (stats.daily) {
            for (let date in stats.daily) {
                if (stats.daily[date][serviceKey]) {
                    result.daily[date] = stats.daily[date][serviceKey];
                } else {
                    result.daily[date] = { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } };
                }
            }
        }
        return result;
    }

    // 2. Formatting Helpers
    function formatTime(seconds) {
        if (seconds === 0) return '0秒';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) {
            return `${mins}分${secs}秒`;
        }
        return `${secs}秒`;
    }

    function formatTimeShort(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // 3. Render Dashboard Metrics
    let timeChartInstance = null;
    let tapsChartInstance = null;
    let dailyChartInstance = null;

    function renderDashboard(serviceKey = 'global') {
        const stats = getStatsForService(serviceKey);

        // 3.1. Compute Cards
        const totalDuration = stats.play.duration + stats.edit.duration;
        const totalTaps = stats.play.taps + stats.edit.taps;

        document.getElementById('total-time').textContent = formatTime(totalDuration);
        document.getElementById('total-taps').textContent = `${totalTaps.toLocaleString()}回`;

        const activeModeEl = document.getElementById('active-mode');
        const activeModeDescEl = document.getElementById('active-mode-desc');
        if (totalTaps === 0) {
            activeModeEl.textContent = '-';
            activeModeDescEl.textContent = 'アクティビティが記録されていません';
            activeModeEl.parentElement.classList.remove('highlight');
        } else if (stats.play.taps >= stats.edit.taps) {
            activeModeEl.textContent = '学習モード';
            activeModeDescEl.textContent = 'プレイ操作が最も多く記録されています';
            activeModeEl.parentElement.classList.add('highlight');
        } else {
            activeModeEl.textContent = '編集/作成モード';
            activeModeDescEl.textContent = 'データ作成操作が最も多く記録されています';
            activeModeEl.parentElement.classList.add('highlight');
        }

        // 3.2. Populate Table
        const rawBody = document.getElementById('raw-data-body');
        rawBody.innerHTML = '';

        const modes = [
            { key: 'play', name: '学習モード (Play)', badge: 'badge-play' },
            { key: 'edit', name: '編集/作成モード (Edit)', badge: 'badge-edit' }
        ];

        modes.forEach(mode => {
            const data = stats[mode.key];
            const durationMin = data.duration / 60;
            const density = durationMin > 0 ? Math.round(data.taps / durationMin) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="${mode.badge}">${mode.name}</span></td>
                <td>${data.duration.toLocaleString()}</td>
                <td>${formatTimeShort(data.duration)}</td>
                <td>${data.taps.toLocaleString()}</td>
                <td>${density.toLocaleString()} タップ/分</td>
            `;
            rawBody.appendChild(tr);
        });

        // 3.3. Initialize or Update Chart.js Charts
        renderCharts(stats);
    }

    // 4. Chart Rendering
    function renderCharts(stats) {
        // Destroy existing instances to support re-renders (like resets)
        if (timeChartInstance) timeChartInstance.destroy();
        if (tapsChartInstance) tapsChartInstance.destroy();
        if (dailyChartInstance) dailyChartInstance.destroy();

        // Chart styling variables
        const fontConfig = {
            family: "'Outfit', 'Noto Sans JP', sans-serif",
            size: 12
        };

        const gridConfig = {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
        };

        // 4.1. Time Chart (Duration in Minutes)
        const ctxTime = document.getElementById('timeChart').getContext('2d');
        const playTimeMin = Math.round((stats.play.duration / 60) * 10) / 10;
        const editTimeMin = Math.round((stats.edit.duration / 60) * 10) / 10;

        timeChartInstance = new Chart(ctxTime, {
            type: 'bar',
            data: {
                labels: ['学習モード (Play)', '編集/作成モード (Edit)'],
                datasets: [{
                    label: '利用時間 (分)',
                    data: [playTimeMin, editTimeMin],
                    backgroundColor: [
                        'rgba(99, 102, 241, 0.65)',  // Indigo
                        'rgba(16, 185, 129, 0.65)'  // Emerald
                    ],
                    borderColor: [
                        '#6366f1',
                        '#10b981'
                    ],
                    borderWidth: 1.5,
                    borderRadius: 8,
                    barThickness: 60
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#131a2c',
                        titleColor: '#f8fafc',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.parsed.y} 分`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: gridConfig,
                        ticks: { color: '#64748b', font: fontConfig },
                        title: { display: true, text: '分', color: '#64748b', font: fontConfig }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: fontConfig }
                    }
                }
            }
        });

        // 4.2. Taps Chart
        const ctxTaps = document.getElementById('tapsChart').getContext('2d');
        tapsChartInstance = new Chart(ctxTaps, {
            type: 'bar',
            data: {
                labels: ['学習モード (Play)', '編集/作成モード (Edit)'],
                datasets: [{
                    label: 'タップ回数',
                    data: [stats.play.taps, stats.edit.taps],
                    backgroundColor: [
                        'rgba(99, 102, 241, 0.65)',
                        'rgba(16, 185, 129, 0.65)'
                    ],
                    borderColor: [
                        '#6366f1',
                        '#10b981'
                    ],
                    borderWidth: 1.5,
                    borderRadius: 8,
                    barThickness: 60
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#131a2c',
                        titleColor: '#f8fafc',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.parsed.y.toLocaleString()} 回`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: gridConfig,
                        ticks: { color: '#64748b', font: fontConfig },
                        title: { display: true, text: 'タップ回数', color: '#64748b', font: fontConfig }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: fontConfig }
                    }
                }
            }
        });

        // 4.3. Daily Chart (Duration over 7 days)
        const ctxDaily = document.getElementById('dailyChart').getContext('2d');
        
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            last7Days.push(dateKey);
        }

        const dailyPlayData = [];
        const dailyEditData = [];
        
        last7Days.forEach(date => {
            const dayStats = stats.daily && stats.daily[date] ? stats.daily[date] : { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } };
            dailyPlayData.push(Math.round((dayStats.play.duration / 60) * 10) / 10);
            dailyEditData.push(Math.round((dayStats.edit.duration / 60) * 10) / 10);
        });

        const shortDates = last7Days.map(d => d.slice(5).replace('-', '/'));

        dailyChartInstance = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: shortDates,
                datasets: [
                    {
                        label: '学習モード (分)',
                        data: dailyPlayData,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#1e293b',
                        pointBorderColor: '#6366f1',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: '編集/作成モード (分)',
                        data: dailyEditData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#1e293b',
                        pointBorderColor: '#10b981',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#94a3b8', font: fontConfig, usePointStyle: true, boxWidth: 8 }
                    },
                    tooltip: {
                        backgroundColor: '#131a2c',
                        titleColor: '#f8fafc',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label.replace(' (分)', '')}: ${context.parsed.y} 分`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: gridConfig,
                        ticks: { color: '#64748b', font: fontConfig },
                        title: { display: true, text: '分', color: '#64748b', font: fontConfig },
                        beginAtZero: true
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: fontConfig }
                    }
                }
            }
        });
    }

    // 5. Reset Controller
    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm('すべてのログデータを完全に削除しますか？\n（この操作は元に戻せません）')) {
            const clearedStats = {
                global: { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } }
            };
            localStorage.setItem('ez_activity_logs', JSON.stringify(clearedStats));
            const activeService = document.getElementById('service-selector') ? document.getElementById('service-selector').value : 'global';
            renderDashboard(activeService);
        }
    });

    const serviceSelector = document.getElementById('service-selector');
    if (serviceSelector) {
        serviceSelector.addEventListener('change', (e) => {
            renderDashboard(e.target.value);
        });
    }

    // 6. Initial Render
    if (serviceSelector) {
        renderDashboard(serviceSelector.value);
    } else {
        renderDashboard('global');
    }
});
