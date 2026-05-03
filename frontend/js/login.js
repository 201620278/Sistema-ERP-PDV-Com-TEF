const API_URL = (() => {
  if (typeof window.API_URL === 'string' && window.API_URL.trim() !== '') {
    return window.API_URL;
  }

  const resolved = `${window.location.origin}/api`;
  window.API_URL = resolved;
  return resolved;
})();

(function redirectIfLoggedIn() {
  if (localStorage.getItem('token')) {
    window.location.replace('/');
  }
})();

$('#loginForm').on('submit', function(e) {
  e.preventDefault();
  const username = $('#username').val().trim();
  const password = $('#password').val();
  const $err = $('#login-error');
  const $btn = $('#btn-entrar');

  $err.addClass('d-none').text('');
  $btn.prop('disabled', true);

  $.ajax({
    url: `${API_URL}/auth/login`,
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ username, password }),
    success: function(data) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Redireciona para a página principal de forma robusta
      if (window.location.pathname.endsWith('/login.html')) {
        window.location.replace(window.location.pathname.replace('login.html', 'index.html'));
      } else {
        window.location.replace('index.html');
      }
    },
    error: function(xhr) {
      const msg = xhr.responseJSON && xhr.responseJSON.error
        ? xhr.responseJSON.error
        : 'Não foi possível entrar. Verifique o servidor.';
      $err.removeClass('d-none').text(msg);
    },
    complete: function() {
      $btn.prop('disabled', false);
    }
  });
});

// ============================================
// FOCO AUTOMÁTICO E LIMPEZA DE MODAIS NO LOGIN
// ============================================
$(document).ready(function() {
  // Limpar qualquer modal/overlay remanescente
  $('.modal-backdrop').remove();
  $('body').removeClass('modal-open').css('overflow', '').css('padding-right', '');

  // Remover classes que podem bloquear interação
  document.body.classList.remove('pdv-mode', 'menu-open');

  // Limpar qualquer elemento com pointer-events que bloqueie
  $('*').css('pointer-events', '');
  $('body, html').css('pointer-events', 'auto');

  // Função para focar agressivamente no campo de usuário
  function focarAgressivamente() {
    const campoUsername = $('#username');
    if (campoUsername.length > 0) {
      campoUsername[0].focus({ preventScroll: true });
      campoUsername[0].select();
    }
  }

  // Sequência de foco múltipla
  [0, 100, 300, 500, 800, 1200].forEach(delay => {
    setTimeout(focarAgressivamente, delay);
  });

  // Foco contínuo periódico (para garantir contra perda de foco)
  let focoCount = 0;
  const focoInterval = setInterval(() => {
    focarAgressivamente();
    focoCount++;
    if (focoCount >= 10) clearInterval(focoInterval); // Parar após 5 segundos
  }, 500);

  // Forçar reflow no Electron para garantir cliques
  setTimeout(() => {
    if (window.electronAPI && window.electronAPI.forcarReflow) {
      window.electronAPI.forcarReflow();
    }
  }, 100);

  // Detectar se o campo perdeu foco indevidamente e refocar
  $('#username').on('blur', function() {
    // Só refocar se não estiver no campo de senha (transição intencional)
    if (!$('#password').is(':focus')) {
      setTimeout(() => focarAgressivamente(), 50);
    }
  });
});
