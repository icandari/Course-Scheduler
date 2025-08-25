/**
 * Load an HTML partial into a specified container
 * @param {string} partialPath - Path to the HTML partial file
 * @param {string} containerId - ID of the container element to load the partial into
 * @returns {Promise} - Resolves when the partial is loaded
 */
async function loadPartial(partialPath, containerId) {
  try {
    const response = await fetch(partialPath);
    
    if (!response.ok) {
      throw new Error(`Failed to load partial: ${response.status} ${response.statusText}`);
    }
    
    const partialHtml = await response.text();
    const container = document.getElementById(containerId);
    
    if (!container) {
      throw new Error(`Container element with ID "${containerId}" not found`);
    }
    
    container.innerHTML = partialHtml;
    
    // Initialize any event listeners or scripts specific to this partial
    initializePartialScripts(containerId);
    
    return true;
  } catch (error) {
    console.error('Error loading partial:', error);
    return false;
  }
}

/**
 * Initialize scripts for specific partials
 * @param {string} partialContainerId - ID of the container with the loaded partial
 */
function initializePartialScripts(partialContainerId) {
  if (partialContainerId === 'menu-container') {
    // Initialize menu-specific scripts
    const profileButton = document.getElementById('profilebutton');
    if (profileButton) {
      profileButton.addEventListener('click', function() {
        document.querySelector('.profile-dropdown').classList.toggle('show');
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.matches('#profilebutton')) {
        const dropdowns = document.getElementsByClassName('profile-dropdown');
        for (const dropdown of dropdowns) {
          if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
          }
        }
      }
    });
  }
}

/**
 * Mount the header partial into a container with the given ID.
 * Creates the container at the top of <body> if it does not exist.
 */
async function mountHeader(containerId = 'header-container'){
  let el = document.getElementById(containerId);
  if(!el){
    el = document.createElement('div');
    el.id = containerId;
    document.body.prepend(el);
  }
  await loadPartial('/partials/header.html', containerId);
}