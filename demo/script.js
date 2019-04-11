const SIGNER_URL = '//localhost:8301';

const video = document.getElementById("video");;
const canvasElement = document.getElementById("canvas");
const canvas = canvasElement.getContext("2d");
const expectedScans = 20;
var scanCount = 0;
var scannedCodeData;

function drawLine(begin, end, color) {
  canvas.beginPath();
  canvas.moveTo(begin.x, begin.y);
  canvas.lineTo(end.x, end.y);
  canvas.lineWidth = 4;
  canvas.strokeStyle = color;
  canvas.stroke();
}

function scan() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    //console.debug('QR: have enough data');
    canvasElement.hidden = false;

    canvasElement.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    var imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
    var code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code) {
      drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#FF3B58");
      drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#FF3B58");
      drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#FF3B58");
      drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#FF3B58");
      if (scannedCodeData == code.data) {
          if (scanCount++ > expectedScans) {
            console.log('QR: confirmed code', scanCount, code);
            $("#input-recipient").val(code.data)
            stopScan();
            //window.location.href="/?key=332245f9-5d6d-49ae-80e1-8cf4b8053eb8";
          }
      } else {
          scanCount = 1;
          scannedCodeData = code.data;
      }
    } else {
      //console.debug('QR: code not available');
    }
  }
  requestAnimationFrame(scan);
}

function startScan() {
  navigator.mediaDevices.getUserMedia(
  { video: { facingMode: "environment" } })
  .then(function(stream) {
    /*
    $('.scan-qr .QRcode img').attr('src', '/images/frame.png');
    $('.scan-qr .camera').addClass("hidden");
    $('#canvas, #video').removeClass('hidden');*/
    video.srcObject = stream;
    video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
    video.play();
    requestAnimationFrame(scan);
  }).catch(function(err) {
    throw(err);
    alert('Please give permission to access your camera');
    /* manejar el error */
  });

}

function stopScan() {
    video.srcObject.getTracks().forEach(function(track) { track.stop(); });
    video.pause();
    video.src = null;
    return;
}


function sendEther() {
    const to = $("#input-recipient").val();
    const amountETH = $("#input-ether-amount").val();
    const amount = ethers.utils.parseEther(amountETH);
    $.ajax({
        url: `${SIGNER_URL}/api/ethsend`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            to,
            value: amount.toString(),
            gasPrice: '20000000000'
        }),
        success: data => {
            console.log("check your signer app!");
        },
    }).fail(err => {
        console.error("ethsend failed", err);
    });
}

function pollSigner() {
    setInterval(() => {
        $.ajax({
            url: `${SIGNER_URL}/api/info`,
            method: 'GET',
            success: data => {
                if (data.info.address) {
                    $('#text-address').html(data.info.address);
                    $('#text-balance').html(data.info.balance);
                    $('#img-address-qr').prop('src', `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${data.info.address}&choe=UTF-8`);
                    $('#div-main').removeClass('d-none');
                    $('#div-waiting').addClass('d-none');
                } else {
                    $('#div-main').addClass('d-none');
                    $('#div-waiting').removeClass('d-none');
                }
            }
        }).fail(() => {
                $('#div-main').addClass('d-none');
                $('#div-waiting').removeClass('d-none');
        });
    }, 1000);
}

(function main() {
    pollSigner();
})();
