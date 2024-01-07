export function escape(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#039;')
        .replace(/"/g, '&quot;');
}

export function html(strings, ...values) {
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
        if (result.endsWith('$')) {
            result = result.slice(0, -1);
            result += values[i].toString() + strings[i + 1];
        } else {
            result += escape(values[i].toString()) + strings[i + 1];
        }
    }
    return result;
}

export function toggleFullscreen(elem) {
    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
            document.documentElement.classList.add('fullscreen');
        }
    } else {
        document.documentElement.classList.remove('fullscreen');
        document.exitFullscreen();
    }
}
