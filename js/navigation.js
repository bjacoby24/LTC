import { getDom } from "./dom.js";

export function initNavigation() {
  const dom = getDom();

  function showView(viewId) {
    dom.navLinks.forEach(link => {
      link.classList.toggle("active", link.dataset.view === viewId);
    });

    dom.views.forEach(view => {
      view.classList.toggle("active", view.id === viewId);
    });
  }

  dom.navLinks.forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      const viewId = link.dataset.view;
      if (viewId) {
        showView(viewId);
      }
    });
  });

  if (dom.homeLogo) {
    dom.homeLogo.addEventListener("click", () => {
      showView("dashboardView");
    });
  }

  return {
    showView
  };
}