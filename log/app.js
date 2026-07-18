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

    const chartInstances = [];

    const fontConfig = {
        family: "'Outfit', 'Noto Sans JP', sans-serif",
        size: 12
    };
    const gridConfig = {
        color: 'rgba(255, 255, 255, 0.05)',
        drawBorder: false
    };

    function renderCombinedCharts(projects) {
        // projects is an array of objects: { key, label, stats }
        const ctxTime = document.getElementById('combinedTimeChart').getContext('2d');
        const ctxTaps = document.getElementById('combinedTapsChart').getContext('2d');

        const labels = projects.map(p => p.label);
        const playTimeData = projects.map(p => Math.round((p.stats.play.duration / 60) * 10) / 10);
        const editTimeData = projects.map(p => Math.round((p.stats.edit.duration / 60) * 10) / 10);
        const playTapsData = projects.map(p => p.stats.play.taps);
        const editTapsData = projects.map(p => p.stats.edit.taps);

        const timeChart = new Chart(ctxTime, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '学習モード (分)',
                        data: playTimeData,
                        backgroundColor: 'rgba(99, 102, 241, 0.65)',
                        borderColor: '#6366f1',
                        borderWidth: 1.5,
                        borderRadius: 4
                    },
                    {
                        label: '編集/作成モード (分)',
                        data: editTimeData,
                        backgroundColor: 'rgba(16, 185, 129, 0.65)',
                        borderColor: '#10b981',
                        borderWidth: 1.5,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: fontConfig } },
                    tooltip: { backgroundColor: '#131a2c', titleColor: '#f8fafc', bodyColor: '#94a3b8' }
                },
                scales: {
                    y: { grid: gridConfig, ticks: { color: '#64748b', font: fontConfig } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: fontConfig } }
                }
            }
        });

        const tapsChart = new Chart(ctxTaps, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '学習モード (回)',
                        data: playTapsData,
                        backgroundColor: 'rgba(99, 102, 241, 0.65)',
                        borderColor: '#6366f1',
                        borderWidth: 1.5,
                        borderRadius: 4
                    },
                    {
                        label: '編集/作成モード (回)',
                        data: editTapsData,
                        backgroundColor: 'rgba(16, 185, 129, 0.65)',
                        borderColor: '#10b981',
                        borderWidth: 1.5,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: fontConfig } },
                    tooltip: { backgroundColor: '#131a2c', titleColor: '#f8fafc', bodyColor: '#94a3b8' }
                },
                scales: {
                    y: { grid: gridConfig, ticks: { color: '#64748b', font: fontConfig } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: fontConfig } }
                }
            }
        });
        chartInstances.push(timeChart, tapsChart);
    }

    function renderProjectSection(project) {
        const template = document.getElementById('project-template');
        const container = document.getElementById('projects-container');
        const clone = template.content.cloneNode(true);
        const section = clone.querySelector('.project-section');
        
        section.querySelector('.project-title').textContent = project.label;
        
        const stats = project.stats;
        const totalDuration = stats.play.duration + stats.edit.duration;
        const totalTaps = stats.play.taps + stats.edit.taps;

        section.querySelector('.total-time').textContent = formatTime(totalDuration);
        section.querySelector('.total-taps').textContent = `${totalTaps.toLocaleString()}回`;

        const activeModeEl = section.querySelector('.active-mode');
        const activeModeDescEl = section.querySelector('.active-mode-desc');
        if (totalTaps === 0) {
            activeModeEl.textContent = '-';
            activeModeDescEl.textContent = 'アクティビティが記録されていません';
            activeModeEl.closest('.card').classList.remove('highlight');
        } else if (stats.play.taps >= stats.edit.taps) {
            activeModeEl.textContent = '学習モード';
            activeModeDescEl.textContent = 'プレイ操作が最も多く記録されています';
            activeModeEl.closest('.card').classList.add('highlight');
        } else {
            activeModeEl.textContent = '編集/作成モード';
            activeModeDescEl.textContent = 'データ作成操作が最も多く記録されています';
            activeModeEl.closest('.card').classList.add('highlight');
        }

        const rawBody = section.querySelector('.raw-data-body');
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

        // Charts
        const ctxTime = section.querySelector('.timeChart').getContext('2d');
        const timeChart = new Chart(ctxTime, {
            type: 'bar',
            data: {
                labels: ['学習モード (Play)', '編集/作成モード (Edit)'],
                datasets: [{
                    label: '利用時間 (分)',
                    data: [Math.round((stats.play.duration / 60) * 10) / 10, Math.round((stats.edit.duration / 60) * 10) / 10],
                    backgroundColor: ['rgba(99, 102, 241, 0.65)', 'rgba(16, 185, 129, 0.65)'],
                    borderColor: ['#6366f1', '#10b981'],
                    borderWidth: 1.5,
                    borderRadius: 8,
                    barThickness: 60
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: gridConfig, ticks: { color: '#64748b', font: fontConfig } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: fontConfig } }
                }
            }
        });

        const ctxTaps = section.querySelector('.tapsChart').getContext('2d');
        const tapsChart = new Chart(ctxTaps, {
            type: 'bar',
            data: {
                labels: ['学習モード (Play)', '編集/作成モード (Edit)'],
                datasets: [{
                    label: 'タップ回数',
                    data: [stats.play.taps, stats.edit.taps],
                    backgroundColor: ['rgba(99, 102, 241, 0.65)', 'rgba(16, 185, 129, 0.65)'],
                    borderColor: ['#6366f1', '#10b981'],
                    borderWidth: 1.5,
                    borderRadius: 8,
                    barThickness: 60
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: gridConfig, ticks: { color: '#64748b', font: fontConfig } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: fontConfig } }
                }
            }
        });

        const ctxDaily = section.querySelector('.dailyChart').getContext('2d');
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7Days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        }
        const dailyPlayData = [];
        const dailyEditData = [];
        last7Days.forEach(date => {
            const dayStats = stats.daily && stats.daily[date] ? stats.daily[date] : { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } };
            dailyPlayData.push(Math.round((dayStats.play.duration / 60) * 10) / 10);
            dailyEditData.push(Math.round((dayStats.edit.duration / 60) * 10) / 10);
        });

        const dailyChart = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: last7Days.map(d => d.slice(5).replace('-', '/')),
                datasets: [
                    {
                        label: '学習モード (分)',
                        data: dailyPlayData,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        borderWidth: 2,
                        tension: 0.3, fill: true,
                        pointBackgroundColor: '#1e293b', pointBorderColor: '#6366f1'
                    },
                    {
                        label: '編集/作成モード (分)',
                        data: dailyEditData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        borderWidth: 2,
                        tension: 0.3, fill: true,
                        pointBackgroundColor: '#1e293b', pointBorderColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8', font: fontConfig } } },
                scales: {
                    y: { grid: gridConfig, ticks: { color: '#64748b', font: fontConfig }, beginAtZero: true },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: fontConfig } }
                }
            }
        });

        chartInstances.push(timeChart, tapsChart, dailyChart);

        section.querySelector('.btn-reset').addEventListener('click', () => {
            if (confirm(`${project.label}のログデータを完全に削除しますか？\n（この操作は元に戻せません）`)) {
                let currentStats = getStats();
                if (currentStats[project.key]) {
                    delete currentStats[project.key];
                }
                if (currentStats.daily) {
                    for(let date in currentStats.daily) {
                        if (currentStats.daily[date][project.key]) {
                            delete currentStats.daily[date][project.key];
                        }
                    }
                }
                localStorage.setItem('ez_activity_logs', JSON.stringify(currentStats));
                renderAll();
            }
        });

        container.appendChild(clone);
    }

    function renderAll() {
        // Destroy existing charts
        chartInstances.forEach(c => c.destroy());
        chartInstances.length = 0;
        
        document.getElementById('projects-container').innerHTML = '';

        const projectKeys = [
            { key: 'ez1', label: 'EZ Project 1' },
            { key: 'ez2', label: 'EZ Project 2' },
            { key: 'ez5', label: 'EZ Project 5' }
        ];

        const projects = projectKeys.map(p => ({
            ...p,
            stats: getStatsForService(p.key)
        }));

        renderCombinedCharts(projects);

        projects.forEach(p => {
            renderProjectSection(p);
        });
    }

    renderAll();
});
