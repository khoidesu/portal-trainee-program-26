/**
 * Star Progression Chart Renderer - UIT Trainee Portal
 * Vẽ biểu đồ diễn biến tích lũy sao thực tế của Trainee theo các tuần đào tạo
 * Hỗ trợ giao diện SVG sắc nét, tooltip tương tác và dark/light mode
 */

function renderStarChart(historyData, totalAccumulatedStars) {
  const svg = document.getElementById('gpaSvgChart');
  const tooltip = document.getElementById('chartTooltip');
  if (!svg) return;

  // Clear previous chart
  svg.innerHTML = '';

  let data = [];

  // Kiểm tra nếu historyData là danh sách diễn biến sao hợp lệ
  if (Array.isArray(historyData) && historyData.length > 0 && (historyData[0].periodStars !== undefined || historyData[0].cumulativeStars !== undefined)) {
    data = historyData.map((item, idx) => ({
      period: item.period || `Tuần ${idx + 1}`,
      periodStars: Number(item.periodStars) || 0,
      cumulativeStars: Number(item.cumulativeStars) || 0
    }));
  } else {
    const empty = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    empty.setAttribute('x', '50%');
    empty.setAttribute('y', '50%');
    empty.setAttribute('text-anchor', 'middle');
    empty.setAttribute('fill', 'var(--text-muted)');
    empty.textContent = 'Chưa có dữ liệu sao theo buổi';
    svg.appendChild(empty);
    return;
  }

  // SVG dimensions
  const width = 460;
  const height = 190;
  const paddingLeft = 45;
  const paddingRight = 30;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Tìm giá trị max sao để chia tỷ lệ trục Y
  const maxDataVal = Math.max(...data.map(d => Math.max(d.cumulativeStars, d.periodStars)), 10);
  let maxVal = 60;
  let yTicks = [0, 15, 30, 45, 60];

  if (maxDataVal > 60) {
    maxVal = Math.ceil(maxDataVal / 20) * 20;
    const step = maxVal / 4;
    yTicks = [0, step, step * 2, step * 3, maxVal];
  } else if (maxDataVal <= 35) {
    maxVal = 40;
    yTicks = [0, 10, 20, 30, 40];
  }

  const minVal = Math.min(0, Math.floor(Math.min(...data.map(item => Math.min(item.periodStars, item.cumulativeStars))) / 5) * 5);
  if (minVal < 0) {
    const step = (maxVal - minVal) / 4;
    yTicks = Array.from({ length: 5 }, (_, index) => minVal + index * step);
  }

  function getY(val) {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return paddingTop + chartHeight - ((clamped - minVal) / (maxVal - minVal)) * chartHeight;
  }

  function getX(index) {
    if (data.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  }

  const isDark = document.body.classList.contains('dark-theme');
  const gridStroke = isDark ? '#26334d' : '#e2e8f0';
  const periodLineColor = isDark ? '#3b82f6' : '#2563eb';
  const cumuLineColor = '#f59e0b'; // Amber gold cho sao

  // Draw horizontal grid lines & Y labels
  yTicks.forEach(tick => {
    const yPos = getY(tick);

    // Grid line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingLeft);
    line.setAttribute('y1', yPos);
    line.setAttribute('x2', width - paddingRight);
    line.setAttribute('y2', yPos);
    line.setAttribute('stroke', gridStroke);
    line.setAttribute('stroke-dasharray', '3,3');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    // Label text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', paddingLeft - 8);
    text.setAttribute('y', yPos + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '10px');
    text.setAttribute('fill', '#94a3b8');
    text.textContent = `${Math.round(tick)}`;
    svg.appendChild(text);
  });

  // Calculate polyline points
  const periodPoints = data.map((d, i) => `${getX(i)},${getY(d.periodStars)}`).join(' ');
  const cumulativePoints = data.map((d, i) => `${getX(i)},${getY(d.cumulativeStars)}`).join(' ');

  // 1. Draw Cumulative line (Dashed Amber/Gold Star line)
  const cumuLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  cumuLine.setAttribute('points', cumulativePoints);
  cumuLine.setAttribute('fill', 'none');
  cumuLine.setAttribute('stroke', cumuLineColor);
  cumuLine.setAttribute('stroke-width', '2.5');
  cumuLine.setAttribute('stroke-dasharray', '5,4');
  svg.appendChild(cumuLine);

  // 2. Draw Period Stars line (Solid Blue line)
  const periodLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  periodLine.setAttribute('points', periodPoints);
  periodLine.setAttribute('fill', 'none');
  periodLine.setAttribute('stroke', periodLineColor);
  periodLine.setAttribute('stroke-width', '2.5');
  svg.appendChild(periodLine);

  // 3. Draw dots and X-axis labels
  data.forEach((d, i) => {
    const cx = getX(i);
    const cyPeriod = getY(d.periodStars);
    const cyCumu = getY(d.cumulativeStars);

    // X-axis label (Tuần 1, Tuần 2, Tuần 3, Tuần 4)
    const xText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xText.setAttribute('x', cx);
    xText.setAttribute('y', height - 10);
    xText.setAttribute('text-anchor', 'middle');
    xText.setAttribute('font-size', '11px');
    xText.setAttribute('font-weight', '600');
    xText.setAttribute('fill', '#64748b');
    xText.textContent = d.period;
    svg.appendChild(xText);

    // Cumulative Point (Amber/Gold circle with hover)
    const cumuDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    cumuDot.setAttribute('cx', cx);
    cumuDot.setAttribute('cy', cyCumu);
    cumuDot.setAttribute('r', '5');
    cumuDot.setAttribute('fill', '#f59e0b');
    cumuDot.setAttribute('stroke', '#ffffff');
    cumuDot.setAttribute('stroke-width', '2');
    cumuDot.style.cursor = 'pointer';

    // Tooltip for Cumulative Point
    cumuDot.addEventListener('mouseenter', () => {
      cumuDot.setAttribute('r', '7');
      if (tooltip) {
        tooltip.innerHTML = `<strong>${d.period}</strong><br/>Tổng sao tích lũy: <b>${d.cumulativeStars} sao</b><br/>Sao trong tuần: <b>${formatStarDelta(d.periodStars)} sao</b>`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${cx - 50}px`;
        tooltip.style.top = `${cyCumu - 55}px`;
      }
    });
    cumuDot.addEventListener('mouseleave', () => {
      cumuDot.setAttribute('r', '5');
      if (tooltip) tooltip.style.display = 'none';
    });
    svg.appendChild(cumuDot);

    // Period Star Point (Solid Blue circle with hover)
    const periodDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    periodDot.setAttribute('cx', cx);
    periodDot.setAttribute('cy', cyPeriod);
    periodDot.setAttribute('r', '4.5');
    periodDot.setAttribute('fill', periodLineColor);
    periodDot.setAttribute('stroke', '#ffffff');
    periodDot.setAttribute('stroke-width', '2');
    periodDot.style.cursor = 'pointer';

    periodDot.addEventListener('mouseenter', () => {
      periodDot.setAttribute('r', '6.5');
      if (tooltip) {
        tooltip.innerHTML = `<strong>${d.period}</strong><br/>Sao tuần: <b>+${d.periodStars} sao</b><br/>Tích lũy: <b>${d.cumulativeStars} sao</b>`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${cx - 50}px`;
        tooltip.style.top = `${cyPeriod - 55}px`;
      }
    });
    periodDot.addEventListener('mouseleave', () => {
      periodDot.setAttribute('r', '4.5');
      if (tooltip) tooltip.style.display = 'none';
    });
    svg.appendChild(periodDot);
  });
}

// Backward compatibility & global export
window.renderStarChart = renderStarChart;
window.renderGpaChart = renderStarChart;
