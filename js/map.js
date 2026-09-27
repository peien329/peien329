// 世界地圖：D3 + TopoJSON，可縮放、點選國家、顯示足跡圖釘
/* global d3, topojson */

export async function createMap(svgEl, { onCountryClick, onPinClick }) {
  const topo = await fetch('data/world-50m.json').then((r) => r.json());
  const features = topojson.feature(topo, topo.objects.countries).features;
  // 同一個國家可能有多塊（例如北賽普勒斯歸賽普勒斯），依 id 合併
  const byCode = new Map();
  for (const f of features) {
    const prev = byCode.get(f.id);
    if (prev) {
      byCode.set(f.id, {
        type: 'Feature',
        id: f.id,
        geometry: topojson.merge(topo, topo.objects.countries.geometries.filter((g) => g.id === f.id)),
      });
    } else byCode.set(f.id, f);
  }
  const countries = [...byCode.values()];

  const svg = d3.select(svgEl);
  const root = svg.append('g');
  const sphere = root.append('path').attr('class', 'sphere');
  const graticule = root.append('path').attr('class', 'graticule');
  const land = root.append('g');
  const pinLayer = root.append('g').attr('class', 'pins');

  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);

  let statuses = new Map();
  let selected = null;
  let pins = [];
  let picking = null;
  let k = 1;

  const paths = land
    .selectAll('path')
    .data(countries, (d) => d.id)
    .join('path')
    .attr('class', 'country')
    .on('click', (event, d) => {
      if (picking) return;
      event.stopPropagation();
      onCountryClick(d.id);
    });

  const zoom = d3
    .zoom()
    .scaleExtent([1, 60])
    .clickDistance(8)
    .on('zoom', (event) => {
      k = event.transform.k;
      root.attr('transform', event.transform);
      pinLayer.selectAll('circle').attr('r', 6 / k).attr('stroke-width', 2 / k);
    });
  svg.call(zoom).on('dblclick.zoom', null);

  svg.on('click', (event) => {
    if (!picking) return;
    const [x, y] = d3.pointer(event, root.node());
    const lngLat = projection.invert([x, y]);
    if (!lngLat || !Number.isFinite(lngLat[0])) return;
    const cb = picking;
    picking = null;
    svgEl.classList.remove('picking');
    cb({ lng: lngLat[0], lat: lngLat[1], country: countryAt(lngLat[1], lngLat[0]) });
  });

  function layout() {
    const { width, height } = svgEl.getBoundingClientRect();
    if (!width || !height) return;
    projection.fitExtent([[8, 8], [width - 8, height - 8]], { type: 'Sphere' });
    sphere.attr('d', path({ type: 'Sphere' }));
    graticule.attr('d', path(d3.geoGraticule10()));
    paths.attr('d', path);
    drawPins();
    // 不能拖到地球外面的空白處
    const [[x0, y0], [x1, y1]] = path.bounds({ type: 'Sphere' });
    zoom.translateExtent([[x0 - 8, y0 - 8], [x1 + 8, y1 + 8]]).extent([[0, 0], [width, height]]);
  }

  // 預設視角：直式手機螢幕上整張地圖太扁，放大並以亞洲為中心
  function homeTransform() {
    const { width, height } = svgEl.getBoundingClientRect();
    const [[, y0], [, y1]] = path.bounds({ type: 'Sphere' });
    const mapH = y1 - y0;
    if (mapH >= height * 0.6) return d3.zoomIdentity;
    const scale = Math.min(4, height / mapH);
    const [cx, cy] = projection([112, 25]);
    return d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy);
  }

  function refreshClasses() {
    paths
      .classed('visited', (d) => statuses.get(d.id) === 'visited')
      .classed('wish', (d) => statuses.get(d.id) === 'wish')
      .classed('selected', (d) => d.id === selected);
  }

  function drawPins() {
    pinLayer
      .selectAll('circle')
      .data(pins, (d) => d.id)
      .join('circle')
      .attr('cx', (d) => projection([d.lng, d.lat])[0])
      .attr('cy', (d) => projection([d.lng, d.lat])[1])
      .attr('r', 6 / k)
      .attr('stroke-width', 2 / k)
      .on('click', (event, d) => {
        if (picking) return;
        event.stopPropagation();
        onPinClick(d.id);
      });
  }

  function countryAt(lat, lng) {
    const f = countries.find((c) => d3.geoContains(c, [lng, lat]));
    return f ? f.id : null;
  }

  new ResizeObserver(() => layout()).observe(svgEl);
  layout();
  svg.call(zoom.transform, homeTransform());

  return {
    codes: countries.map((c) => c.id),
    countryAt,
    setStatuses(map) {
      statuses = map;
      refreshClasses();
    },
    setSelected(code) {
      selected = code;
      refreshClasses();
    },
    setPins(list) {
      pins = list.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      drawPins();
    },
    focusCountry(code) {
      const f = byCode.get(code);
      if (!f) return;
      const { width, height } = svgEl.getBoundingClientRect();
      // 只看主要區塊，避免海外領地讓範圍過大（例如法國）
      let target = f;
      if (f.geometry.type === 'MultiPolygon') {
        const polys = f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }));
        target = polys.reduce((a, b) => (path.area(a) >= path.area(b) ? a : b));
      }
      const [[x0, y0], [x1, y1]] = path.bounds(target);
      // 下半部會被資訊面板蓋住，所以把國家放在上半部
      const visibleH = height * 0.5;
      const scale = Math.max(1, Math.min(40, 0.8 / Math.max((x1 - x0) / width, (y1 - y0) / visibleH)));
      svg
        .transition()
        .duration(650)
        .call(
          zoom.transform,
          d3.zoomIdentity
            .translate(width / 2, visibleH / 2 + 40)
            .scale(scale)
            .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
        );
    },
    focusPoint(lat, lng) {
      const { width, height } = svgEl.getBoundingClientRect();
      const [x, y] = projection([lng, lat]);
      const scale = Math.max(k, 8);
      svg
        .transition()
        .duration(650)
        .call(zoom.transform, d3.zoomIdentity.translate(width / 2, height * 0.3).scale(scale).translate(-x, -y));
    },
    resetView() {
      svg.transition().duration(650).call(zoom.transform, homeTransform());
    },
    startPick(cb) {
      picking = cb;
      svgEl.classList.add('picking');
    },
    cancelPick() {
      picking = null;
      svgEl.classList.remove('picking');
    },
  };
}
