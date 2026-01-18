"use strict";

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#txtSearch");
const btnRandom = document.querySelector("#btnRandom");
const regionChips = document.querySelectorAll(".chip");
const countryDetails = document.querySelector("#country-details");
const neighborsContainer = document.querySelector("#neighbors");
const neighborSection = document.querySelector("#neighbor-section");
const loader = document.querySelector("#loader");
const bgOverlay = document.querySelector("#background-overlay");

const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 Hours

// Cache Management
const cache = {
  get(key) {
    const item = localStorage.getItem(`country_cache_${key}`);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(`country_cache_${key}`);
      return null;
    }
    return parsed.data;
  },
  set(key, data) {
    const item = {
      timestamp: Date.now(),
      data: data,
    };
    localStorage.setItem(`country_cache_${key}`, JSON.stringify(item));
  },
};

let currentRequestId = 0;

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const countryName = searchInput.value.trim().toLowerCase();
  if (countryName) {
    handleSearch(countryName);
  }
});

btnRandom.addEventListener("click", () => handleRandomSearch());

regionChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const region = chip.getAttribute("data-region");
    handleRegionSearch(region);
  });
});

async function handleRandomSearch() {
  try {
    showLoader(true);
    clearResults();
    const response = await fetch(
      "https://restcountries.com/v3.1/all?fields=name",
    );
    const countries = await response.json();
    const randomCountry =
      countries[Math.floor(Math.random() * countries.length)];
    handleSearch(randomCountry.name.common);
  } catch (error) {
    renderError("Failed to get random country");
    showLoader(false);
  }
}

async function handleRegionSearch(region) {
  try {
    showLoader(true);
    clearResults();
    const response = await fetch(
      `https://restcountries.com/v3.1/region/${region}?fields=name`,
    );
    const countries = await response.json();
    const randomCountry =
      countries[Math.floor(Math.random() * countries.length)];
    handleSearch(randomCountry.name.common);
  } catch (error) {
    renderError("Failed to search by region");
    showLoader(false);
  }
}

async function handleSearch(countryName) {
  const requestId = ++currentRequestId;

  try {
    showLoader(true);
    clearResults();

    let countryData = cache.get(countryName);

    if (!countryData) {
      countryData = await fetchCountryData(countryName);
      if (countryData && requestId === currentRequestId) {
        cache.set(countryName, countryData);
        cache.set(countryData.name.common.toLowerCase(), countryData);
      }
    }

    if (requestId !== currentRequestId) return;

    if (!countryData) throw new Error("Country not found");

    renderCountry(countryData);

    if (countryData.borders && countryData.borders.length > 0) {
      const neighborKey = `neighbors_${countryData.borders.sort().join("_")}`;
      let neighbors = cache.get(neighborKey);

      if (!neighbors) {
        neighbors = await fetchNeighbors(countryData.borders);
        if (neighbors.length > 0 && requestId === currentRequestId) {
          cache.set(neighborKey, neighbors);
        }
      }

      if (requestId === currentRequestId) {
        renderNeighbors(neighbors);
      }
    } else {
      neighborSection.classList.remove("visible");
    }
  } catch (error) {
    if (requestId === currentRequestId) {
      console.error(error);
      renderError(error.message);
    }
  } finally {
    if (requestId === currentRequestId) {
      showLoader(false);
    }
  }
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        if (i === retries)
          throw new Error("Too many requests. Please try again in a moment.");
        // Exponential backoff
        await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, i)));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      if (i === retries) throw err;
    }
  }
}

async function fetchCountryData(name) {
  // Try full name first
  let dataArr = await fetchWithRetry(
    `https://restcountries.com/v3.1/name/${name}?fullText=true`,
  );

  if (!dataArr) {
    // Try fuzzy search
    dataArr = await fetchWithRetry(
      `https://restcountries.com/v3.1/name/${name}`,
    );
  }

  return dataArr ? dataArr[0] : null;
}

async function fetchNeighbors(codes) {
  const data = await fetchWithRetry(
    `https://restcountries.com/v3.1/alpha?codes=${codes.join(",")}`,
  );
  return data || [];
}

function renderCountry(data) {
  // Update background
  bgOverlay.style.backgroundImage = `url(${data.flags.svg})`;

  const currencies = Object.values(data.currencies || {})
    .map((curr) => `${curr.name} (${curr.symbol || ""})`)
    .join(", ");

  const languages = Object.values(data.languages || {}).join(", ");

  const html = `
        <div class="glass main-card">
            <div class="flag-wrapper">
                <img src="${data.flags.svg}" alt="${data.name.common} flag" class="flag-img">
                <div class="badge-container" style="position: absolute; bottom: 10px; left: 10px;">
                    ${data.unMember ? '<span class="badge badge-un">UN Member</span>' : ""}
                    <span class="badge badge-car">🚗 ${data.car.side.toUpperCase()}</span>
                </div>
            </div>
            <div class="info-section">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h2>
                            ${data.name.common}
                            ${data.coatOfArms.svg ? `<img src="${data.coatOfArms.svg}" class="coat-of-arms" alt="Coat of Arms">` : ""}
                        </h2>
                        <p style="color: var(--text-secondary); margin-top: -0.5rem;">${data.name.official}</p>
                    </div>
                    <div style="text-align: right">
                         <span class="badge badge-status">${data.status}</span>
                    </div>
                </div>
                
                <hr style="border: 0; border-top: 1px solid var(--glass-border); margin-top: 1.5rem; margin-bottom: 1.5rem;">

                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Capital</span>
                        <span class="stat-value">${data.capital?.[0] || "N/A"}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Population</span>
                        <span class="stat-value">${formatNumber(data.population)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Calling Code</span>
                        <span class="stat-value">${data.idd.root}${data.idd.suffixes?.[0] || ""}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Top Level Domain</span>
                        <span class="stat-value">${data.tld?.[0] || "N/A"}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Currency</span>
                        <span class="stat-value">${currencies || "N/A"}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Languages</span>
                        <span class="stat-value">${languages || "N/A"}</span>
                    </div>
                </div>

                <div class="area-stats">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="stat-label">Total land area</span>
                        <span class="stat-value">${data.area.toLocaleString()} km²</span>
                    </div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 10px; margin-top: 0.5rem; overflow: hidden;">
                        <div style="width: ${Math.min((data.area / 17098242) * 100, 100)}%; height: 100%; background: var(--accent);"></div>
                    </div>
                    <p style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.3rem;">Relative to Earth's largest country (Russia)</p>
                </div>

                <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                    <a href="${data.maps.googleMaps}" target="_blank" style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 8px; color: var(--accent); text-decoration: none; font-weight: 600; font-size: 0.9rem;">
                         Google Maps ↗
                    </a>
                    <a href="https://en.wikipedia.org/wiki/${data.name.common}" target="_blank" style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 8px; color: #fff; text-decoration: none; font-weight: 600; font-size: 0.9rem;">
                         Wikipedia ↗
                    </a>
                </div>
            </div>
        </div>
    `;

  countryDetails.innerHTML = html;
  setTimeout(() => countryDetails.classList.add("visible"), 100);
}

function renderNeighbors(neighbors) {
  neighborsContainer.innerHTML = neighbors
    .map(
      (country) => `
        <div class="glass neighbor-card" onclick="handleSearch('${country.name.common}')">
            <img src="${country.flags.svg}" class="neighbor-flag" alt="${country.name.common}">
            <div class="neighbor-name">${country.name.common}</div>
        </div>
    `,
    )
    .join("");

  neighborSection.classList.add("visible");
}

function renderError(msg) {
  countryDetails.innerHTML = `
        <div class="glass" style="padding: 2rem; text-align: center; border-color: rgba(239, 68, 68, 0.5);">
            <p style="color: #ef4444; font-weight: 600;">Error: ${msg}</p>
            <p style="font-size: 0.9rem; margin-top: 0.5rem;">Please check the spelling and try again.</p>
        </div>
    `;
  countryDetails.classList.add("visible");
}

function showLoader(show) {
  if (show) {
    loader.classList.add("show-loader");
  } else {
    loader.classList.remove("show-loader");
  }
}

function clearResults() {
  countryDetails.classList.remove("visible");
  neighborSection.classList.remove("visible");
  // Clear content immediately to avoid race conditions with fast API responses
  countryDetails.innerHTML = "";
  neighborsContainer.innerHTML = "";
}

function formatNumber(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(2) + " B";
  if (num >= 1000000) return (num / 1000000).toFixed(2) + " M";
  if (num >= 1000) return (num / 1000).toFixed(1) + " K";
  return num.toString();
}

// Initial state or URL search could be added here
const urlParams = new URLSearchParams(window.location.search);
const initialCountry = urlParams.get("q");
if (initialCountry) {
  handleSearch(initialCountry);
}
