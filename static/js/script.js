// Created By Robert Herley
// Inspiration from: https://2019.vizsociety.net/d3viz/digitalnyc/basic.html

class NYCViz {
  constructor() {
    this.state = {
      accidents: null,
      currentDate: null,
      dataType: 'DAILY' // DAILY or DEATHS
    };
    this.svg = null;
    this.g = null;
    this.projection = null;
    this.centered = null;
    this.tooltip = d3.select('#tooltip');
    this.buttons = document.getElementById('buttons').children;
    this.buttons[0].addEventListener('click', () => this.handleClick(0));
    this.buttons[1].addEventListener('click', () => this.handleClick(1));
  }

  handleClick(num) {
    this.buttons[num].className = 'active';
    this.buttons[1 - num].className = '';
    this.updateState({ dataType: num ? 'DEATHS' : 'DAILY' });
  }

  handleZoom(d, i, el) {
    const { x, y, width, height } = el[i].getBBox();
    const centroid = [x + width / 2, y + height / 2]; // for non-circular elems
    if (this.centered === d) {
      // zoom out
      this.g
        .transition()
        .duration(600)
        .attr('transform', `scale(1) translate(0,0)`);
    } else {
      // zoom in
      const sF = el[i].nodeName === 'circle' ? 5 : 3;
      this.g
        .transition()
        .duration(600)
        .attr(
          'transform',
          `translate(${960 / 2},${550 /
            2}) scale(${sF}) translate(${-centroid[0]}, ${-centroid[1]})`
        );
      this.centered = d;
    }
  }

  handleTooltip(d) {
    this.tooltip
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 20 + 'px')
      .style('display', 'block').html(`
          <h3>${dayjs(d.accidentdate).format('MMMM D, YYYY')} @ 
            ${d.time}</h3>
          ${d.onStreetName && `<h4>${d.onStreetName.toLowerCase()}</h4>`}
          ${d.borough && `<h4>${d.borough.toLowerCase()}</h4>`}
          <div class="mono">${d.location}</div>
          <span>Injuries: ${d.numberOfPersonsInjured}</span> &middot;
          <span>Deaths: ${d.numberOfPersonsKilled}</span>
        `);
  }

  renderInnerControls() {
    const con = document.getElementById('inner_controls');
    if (this.state.dataType === 'DAILY') {
      const prettyDate = dayjs(this.state.currentDate).format('MMMM D, YYYY');
      con.innerHTML = `
        <h2>${this.state.accidents.length.toLocaleString()} Accidents on ${prettyDate}</h2>
        <div class="legend">
          <div class="circle">No Injuries</div>
          <div class="circle injuries">Injuries Reported</div>
          <div class="circle death">Deaths Reported</div>
        </div>
        <div id="flatpickr">Change Date</div>
        `;
      flatpickr('#flatpickr', {
        minDate: '2012-07',
        maxDate: '2019-03-16',
        defaultDate: this.state.currentDate,
        onChange: async (_, date) =>
          this.updateState({ dataType: 'DAILY', currentDate: date })
      });
    } else {
      const totalDeaths = this.state.accidents
        .reduce((acc, curr) => acc + curr.numberOfPersonsKilled, 0)
        .toLocaleString();
      con.innerHTML = `
        <h2>Deaths From July 2012 to March 2019</h2>
        <div class="legend">
          <div class="circle death">Accident with Death Reported</div>
          <div style="padding-top: 0.5rem;">Total Motor Vehicle Deaths: <span class="mono">${totalDeaths}</span></div>
        </div>
      `;
    }
  }

  drawDailyAccidents() {
    this.g.selectAll('circle').remove();
    this.g
      .selectAll('circle')
      .data(this.state.accidents)
      .enter()
      .append('circle')
      .attr(
        'cx',
        ({ longitude: lo, latitude: la }) => this.projection([lo, la])[0]
      )
      .attr(
        'cy',
        ({ longitude: lo, latitude: la }) => this.projection([lo, la])[1]
      )
      .attr('r', '2px')
      .attr('class', d => {
        if (d.numberOfPersonsKilled) {
          return 'deaths';
        } else if (d.numberOfPersonsInjured) {
          return 'injuries';
        } else {
          return 'accidents';
        }
      })
      .on('mousemove', this.handleTooltip.bind(this))
      .on('mouseout', () => {
        this.tooltip.style('display', 'none');
      })
      .on('mousedown', this.handleZoom.bind(this));
  }

  drawTotalDeaths() {
    this.g.selectAll('circle').remove();
    this.g
      .selectAll('circle')
      .data(this.state.accidents)
      .enter()
      .append('circle')
      .attr(
        'cx',
        ({ longitude: lo, latitude: la }) => this.projection([lo, la])[0]
      )
      .attr(
        'cy',
        ({ longitude: lo, latitude: la }) => this.projection([lo, la])[1]
      )
      .attr('class', 'deaths')
      .attr('r', d => `${2 * d.numberOfPersonsKilled}px`)
      .on('mousemove', this.handleTooltip.bind(this))
      .on('mouseout', () => {
        this.tooltip.style('display', 'none');
      })
      .on('mousedown', this.handleZoom.bind(this));
  }

  async updateState(newState) {
    if (newState.dataType === 'DAILY') {
      newState.currentDate = newState.currentDate || '2019-03-16';
      const accidents = await this.fetchData(
        `/total?date=${newState.currentDate}`
      );
      this.state = Object.assign({}, this.state, newState, { accidents });
      this.drawDailyAccidents();
    } else {
      const accidents = await this.fetchData('/deaths');
      this.state = Object.assign({}, this.state, newState, { accidents });
      this.drawTotalDeaths();
    }
    this.renderInnerControls();
  }

  async fetchData(route) {
    try {
      const response = await fetch(route);
      const json = await response.json();
      return json;
    } catch (err) {
      console.error('Unable to Fetch Data:', err);
    }
  }

  async init() {
    const nyc = await d3.json('./nyc_zipcodes.json');

    this.svg = d3
      .select('#map_container')
      .append('svg')
      .attr('viewBox', '0 0 960 550')
      .attr('preserveAspectRatio', 'xMidYMid');

    this.g = this.svg.append('g').attr('id', 'svg_map');

    this.projection = d3
      .geoMercator()
      .center([-73.94, 40.7])
      .scale(49000);

    const path = d3.geoPath().projection(this.projection);

    this.g
      .selectAll('path')
      .data(nyc.features)
      .enter()
      .append('path')
      .attr('class', 'zip')
      .attr('d', path)
      .on('mousedown', this.handleZoom.bind(this));

    await this.updateState({ dataType: 'DAILY' });
  }
}

const viz = new NYCViz();
window.onload = viz.init.bind(viz);
