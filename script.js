// --- سیستم لاگین ---
        window.onload = function() {
            if(sessionStorage.getItem('henkel-auth') === 'true') {
                document.getElementById('loginOverlay').style.display = 'none';
            }
        };

        document.getElementById('passwordInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') checkPassword();
        });

        function checkPassword() {
            const pass = document.getElementById('passwordInput').value;
            if (pass === "1912") {
                sessionStorage.setItem('henkel-auth', 'true');
                document.getElementById('loginOverlay').style.display = 'none';
                setTimeout(() => map.invalidateSize(), 300);
            } else {
                document.getElementById('loginError').style.display = 'block';
            }
        }

        // ---------- داده‌های اصلی ----------
        let data = { visitors: [], stores: [], routes: [], visits: [], tasks: [], taskCompletions: [] };

        const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
        const routeColors = ['#e20015', '#0056b3', '#28a745', '#e2a700', '#8a2be2', '#00838f', '#c2185b'];

        function getIranianDay(d = new Date()) {
            return (d.getDay() + 1) % 7;
        }

        function loadAllData() {
            try {
                const result = localStorage.getItem('henkel-data');
                if (result) {
                    const parsed = JSON.parse(result);
                    data.visitors = parsed.visitors || [];
                    data.stores = parsed.stores || [];
                    data.routes = parsed.routes || [];
                    data.visits = parsed.visits || [];
                    data.tasks = parsed.tasks || [];
                    data.taskCompletions = parsed.taskCompletions || [];
                }
            } catch (e) {
                console.log('شروع تازه.');
            }
            updateVisitorUI();
            renderMap();
        }

        function saveAllData() {
            try {
                localStorage.setItem('henkel-data', JSON.stringify(data));
            } catch (e) {
                alert('خطا در ذخیره اطلاعات در مرورگر.');
            }
        }

        // حالت‌های کاری
        let isStoreMode = false;
        let isRouteMode = false;
        let isEditRouteMode = false;
        
        let currentRoutePoints = [];
        let tempPolyline = null;
        
        let editMarkers = [];
        let editPolyline = null;

        // نقشه و لایه‌ها
        const map = L.map('map').setView([36.2447, 46.2736], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'Henkel Sales Management'
        }).addTo(map);

        const storesLayer = L.layerGroup().addTo(map);
        const routesLayer = L.layerGroup().addTo(map);
        const todayRouteLayer = L.layerGroup().addTo(map);
        const mapContainer = document.getElementById('map');

        function fillDaySelect() {
            const sel = document.getElementById('routeDaySelect');
            sel.innerHTML = '';
            dayNames.forEach((name, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = name;
                sel.appendChild(opt);
            });
            sel.value = getIranianDay();
        }

        // --- ویزیتورها ---
        function addVisitor() {
            let name = document.getElementById('visitorName').value.trim();
            if (name === "") return alert("لطفا نام ویزیتور را وارد کنید.");
            if (data.visitors.includes(name)) return alert("این ویزیتور قبلا ثبت شده است.");

            data.visitors.push(name);
            saveAllData();
            updateVisitorUI();
            document.getElementById('visitorName').value = "";
        }

        function updateVisitorUI() {
            let list = document.getElementById('visitorList');
            list.innerHTML = "";
            data.visitors.forEach(v => {
                let li = document.createElement('li');
                li.innerText = v;
                list.appendChild(li);
            });

            fillSelectWithVisitors('routeVisitorSelect', 'انتخاب ویزیتور...');
            fillSelectWithVisitors('todayVisitorSelect', 'انتخاب ویزیتور...');
            fillSelectWithVisitors('reportVisitorSelect', 'همه ویزیتورها', true);
            fillSelectWithVisitors('weeklyVisitorSelect', 'انتخاب ویزیتور...');
        }

        function fillTaskDaySelect() {
            const sel = document.getElementById('taskDaySelect');
            sel.innerHTML = '<option value="any">هر روز</option>';
            dayNames.forEach((name, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = name;
                sel.appendChild(opt);
            });
        }

        // --- تسک‌ها ---
        function getWeekKey(date = new Date()) {
            const d = new Date(date);
            const dayIdx = getIranianDay(d);
            d.setDate(d.getDate() - dayIdx);
            d.setHours(0, 0, 0, 0);
            return d.toISOString().slice(0, 10);
        }

        function isTaskDone(taskId) {
            const weekKey = getWeekKey();
            return data.taskCompletions.some(tc => tc.taskId === taskId && tc.weekKey === weekKey && tc.done);
        }

        function toggleTaskDone(taskId) {
            const weekKey = getWeekKey();
            const idx = data.taskCompletions.findIndex(tc => tc.taskId === taskId && tc.weekKey === weekKey);
            if (idx >= 0) data.taskCompletions.splice(idx, 1);
            else data.taskCompletions.push({ taskId, weekKey, done: true });
            saveAllData();
            renderWeeklyPlan(document.getElementById('weeklyVisitorSelect').value);
        }

        function addTask() {
            const visitor = document.getElementById('weeklyVisitorSelect').value;
            if (!visitor) return alert('ابتدا ویزیتور را از بالای همین بخش انتخاب کنید.');
            const dayVal = document.getElementById('taskDaySelect').value;
            const text = document.getElementById('taskText').value.trim();
            if (!text) return alert('متن تسک را وارد کنید.');

            data.tasks.push({
                id: Date.now(), visitor, day: dayVal === 'any' ? 'any' : parseInt(dayVal, 10), text
            });
            saveAllData();
            document.getElementById('taskText').value = '';
            renderWeeklyPlan(visitor);
        }

        function deleteTask(taskId) {
            data.tasks = data.tasks.filter(t => t.id !== taskId);
            data.taskCompletions = data.taskCompletions.filter(tc => tc.taskId !== taskId);
            saveAllData();
            renderWeeklyPlan(document.getElementById('weeklyVisitorSelect').value);
        }

        function renderWeeklyPlan(visitor) {
            const container = document.getElementById('weeklyPlanResult');
            container.style.display = 'block';
            if (!visitor) {
                container.innerHTML = '<span class="muted">ابتدا یک ویزیتور انتخاب کنید.</span>';
                return;
            }
            let html = '';
            dayNames.forEach((name, d) => {
                const route = data.routes.find(r => r.visitor === visitor && r.day === d);
                let routeInfo = '<span class="muted">بدون مسیر</span>';
                if (route) routeInfo = `<span class="badge">${storesNearRoute(route).length} فروشگاه</span>`;

                const dayTasks = data.tasks.filter(t => t.visitor === visitor && (t.day === d || t.day === 'any'));
                html += `<div style="border-bottom:1px solid #eee; padding:6px 0;"><b>${name}</b> - ${routeInfo}`;
                if (dayTasks.length > 0) {
                    html += '<ul style="list-style:none; padding-right:0; margin:4px 0;">';
                    dayTasks.forEach(t => {
                        const done = isTaskDone(t.id);
                        html += `<li style="display:flex; align-items:center; gap:8px; margin:5px 0;">
                            <input type="checkbox" ${done ? 'checked' : ''} onchange="toggleTaskDone(${t.id})">
                            <span style="flex:1; ${done ? 'text-decoration:line-through;color:#999;' : ''}">${t.text}</span>
                            <button onclick="deleteTask(${t.id})" style="width:auto; padding:4px 8px; margin:0; background:#6c757d; font-size:11px;">حذف</button>
                        </li>`;
                    });
                    html += '</ul>';
                }
                html += '</div>';
            });
            container.innerHTML = html;
        }

        function fillSelectWithVisitors(selectId, placeholder, isReportAll) {
            let select = document.getElementById(selectId);
            const currentValue = select.value;
            select.innerHTML = `<option value="${isReportAll ? 'all' : ''}">${placeholder}</option>`;
            data.visitors.forEach(v => {
                let opt = document.createElement('option'); opt.value = v; opt.innerText = v; select.appendChild(opt);
            });
            if ([...select.options].some(o => o.value === currentValue)) select.value = currentValue;
        }

        // --- فروشگاه‌ها ---
        function toggleStoreMode() {
            if (isEditRouteMode) return alert("ابتدا ویرایش مسیر فعلی را ذخیره کنید.");
            
            isStoreMode = !isStoreMode;
            isRouteMode = false;
            
            document.getElementById('addStoreBtn').style.background = isStoreMode ? "var(--success)" : "var(--secondary)";
            document.getElementById('addStoreBtn').innerText = isStoreMode ? "🟢 آماده ثبت فروشگاه (کلیک کنید)" : "📍 فعال‌سازی کلیک برای ثبت فروشگاه";
            document.getElementById('addRouteBtn').style.background = "var(--secondary)";
            document.getElementById('addRouteBtn').innerText = "✏️ رسم مسیر جدید";

            if(isStoreMode) mapContainer.classList.add('map-crosshair');
            else mapContainer.classList.remove('map-crosshair');
        }

        map.on('click', function (e) {
            if (isStoreMode) {
                if (data.visitors.length === 0) return alert("ابتدا ویزیتور ثبت کنید.");
                
                let storeName = prompt("نام فروشگاه:");
                if (!storeName) return;
                let storeType = prompt("نوع فروشگاه (سوپرمارکت، عمده و...):");

                let visitorText = "کد ویزیتور:\n";
                data.visitors.forEach((v, index) => visitorText += (index + 1) + ". " + v + "\n");
                let vIndex = prompt(visitorText);
                let selectedVisitor = data.visitors[vIndex - 1] || "نامشخص";

                let newStore = {
                    id: Date.now(), name: storeName, type: storeType || "نامشخص",
                    visitor: selectedVisitor, lat: e.latlng.lat, lng: e.latlng.lng
                };

                data.stores.push(newStore); saveAllData(); drawStore(newStore); toggleStoreMode();
            }
            else if (isRouteMode) {
                currentRoutePoints.push([e.latlng.lat, e.latlng.lng]);
                if (tempPolyline) map.removeLayer(tempPolyline);
                tempPolyline = L.polyline(currentRoutePoints, { color: 'red', weight: 4 }).addTo(map);
            }
        });

        // پایان دادن به رسم مسیر با دکمه Ctrl کیبورد
        document.addEventListener('keydown', function(e) {
            if ((e.key === 'Control' || e.ctrlKey || e.metaKey) && isRouteMode && currentRoutePoints.length > 1) {
                e.preventDefault(); // جلوگیری از رفتار پیش‌فرض
                
                let visitor = document.getElementById('routeVisitorSelect').value;
                let day = parseInt(document.getElementById('routeDaySelect').value, 10);
                
                // جایگزین مسیر قبلی
                data.routes = data.routes.filter(r => !(r.visitor === visitor && r.day === day));
                data.routes.push({ id: Date.now(), visitor: visitor, day: day, points: currentRoutePoints });
                saveAllData();

                currentRoutePoints = [];
                if (tempPolyline) { map.removeLayer(tempPolyline); tempPolyline = null; }
                toggleRouteMode(); // خروج از حالت رسم
                renderMap();
                
                alert('مسیر با موفقیت ذخیره شد.');
            }
        });

        function drawStore(store) {
            let marker = L.marker([store.lat, store.lng]);
            let popupContent = `
                <div class="store-popup">
                    <h4>🏪 ${store.name}</h4><b>نوع:</b> ${store.type}<br><b>ویزیتور:</b> ${store.visitor}<br>
                    <button class="info-btn" onclick="logVisit(${store.id})">✅ ثبت ویزیت امروز</button>
                </div>`;
            marker.bindPopup(popupContent).addTo(storesLayer);
        }

        // --- مسیرها (جدید و ویرایش) ---
        function toggleRouteMode() {
            if (isEditRouteMode) return alert("ابتدا ویرایش مسیر فعلی را ذخیره کنید.");
            
            let visitor = document.getElementById('routeVisitorSelect').value;
            if (!isRouteMode && !visitor) return alert("ابتدا ویزیتور را از لیست انتخاب کنید.");

            isRouteMode = !isRouteMode;
            isStoreMode = false;
            currentRoutePoints = [];

            let btn = document.getElementById('addRouteBtn');
            btn.style.background = isRouteMode ? "var(--success)" : "var(--secondary)";
            btn.innerText = isRouteMode ? "🟢 در حال رسم (کلید Ctrl=پایان)" : "✏️ رسم مسیر جدید";
            
            document.getElementById('addStoreBtn').style.background = "var(--secondary)";
            document.getElementById('addStoreBtn').innerText = "📍 فعال‌سازی کلیک برای ثبت فروشگاه";
            
            document.getElementById('editRouteBtn').disabled = isRouteMode;
            
            const helper = document.getElementById('routeHelperText');
            if (isRouteMode) {
                map.doubleClickZoom.disable(); // جلوگیری از زوم با دبل کلیک اشتباه حین رسم
                mapContainer.classList.add('map-crosshair');
                helper.style.display = 'block';
                helper.innerText = "برای رسم مسیر روی نقاط نقشه کلیک کنید و در انتها کلید Ctrl کیبورد را فشار دهید.";
            } else {
                map.doubleClickZoom.enable();
                mapContainer.classList.remove('map-crosshair');
                helper.style.display = 'none';
                if (tempPolyline) { map.removeLayer(tempPolyline); tempPolyline = null; }
            }
        }

        function toggleEditRouteMode() {
            let visitor = document.getElementById('routeVisitorSelect').value;
            let day = parseInt(document.getElementById('routeDaySelect').value, 10);
            const helper = document.getElementById('routeHelperText');

            if (!isEditRouteMode) {
                if (!visitor) return alert("ابتدا ویزیتور را انتخاب کنید.");
                
                let routeIndex = data.routes.findIndex(r => r.visitor === visitor && r.day === day);
                if (routeIndex === -1) return alert("مسیری برای این ویزیتور در این روز وجود ندارد تا ویرایش شود.");
                
                // شروع ویرایش
                isEditRouteMode = true;
                document.getElementById('editRouteBtn').innerText = "💾 ذخیره ویرایش";
                document.getElementById('editRouteBtn').style.background = "var(--success)";
                document.getElementById('addRouteBtn').disabled = true;
                
                helper.style.display = 'block';
                helper.innerText = "نقاط (دایره‌های روی مسیر) را با موس گرفته و جابجا کنید. سپس دکمه ذخیره ویرایش را بزنید.";
                
                // مخفی کردن مسیرهای اصلی
                routesLayer.clearLayers();
                
                let route = data.routes[routeIndex];
                editMarkers = [];
                let points = route.points.map(p => [p[0], p[1]]);
                
                editPolyline = L.polyline(points, { color: 'orange', weight: 5, dashArray: '8, 8' }).addTo(map);
                
                // ایجاد مارکرهای قابل درگ
                points.forEach((pt, idx) => {
                    let marker = L.marker(pt, { draggable: true }).addTo(map);
                    marker.on('drag', function(e) {
                        let newPos = marker.getLatLng();
                        points[idx] = [newPos.lat, newPos.lng];
                        editPolyline.setLatLngs(points); // آپدیت خط حین کشیدن
                    });
                    editMarkers.push(marker);
                });
                
                map.fitBounds(editPolyline.getBounds(), { padding: [30, 30] });

            } else {
                // پایان و ذخیره ویرایش
                let newPoints = editMarkers.map(m => {
                    let pos = m.getLatLng();
                    return [pos.lat, pos.lng];
                });
                
                let routeIndex = data.routes.findIndex(r => r.visitor === visitor && r.day === day);
                if (routeIndex !== -1) {
                    data.routes[routeIndex].points = newPoints;
                    saveAllData();
                }
                
                // خروج از حالت ویرایش
                isEditRouteMode = false;
                document.getElementById('editRouteBtn').innerText = "⚙️ ویرایش مسیر";
                document.getElementById('editRouteBtn').style.background = "var(--warning)";
                document.getElementById('addRouteBtn').disabled = false;
                helper.style.display = 'none';
                
                // پاکسازی مارکرهای ویرایش
                editMarkers.forEach(m => map.removeLayer(m));
                editMarkers = [];
                if (editPolyline) map.removeLayer(editPolyline);
                
                renderMap();
                alert("مسیر با موفقیت به‌روزرسانی شد.");
            }
        }

        function drawRoutes() {
            data.routes.forEach(route => {
                const color = routeColors[route.day % routeColors.length];
                L.polyline(route.points, { color: color, weight: 3, dashArray: '5, 10' })
                  .bindPopup(`ویزیتور: ${route.visitor} | روز: ${dayNames[route.day]}`)
                  .addTo(routesLayer);
            });
        }
        
        function renderMap() {
            if (isEditRouteMode) return; // اگر در حال ویرایش هستیم نقشه را رندر اصلی نکن
            storesLayer.clearLayers();
            routesLayer.clearLayers();
            data.stores.forEach(drawStore);
            drawRoutes();
        }

        // --- توابع کمکی ---
        function toXY(lat, lng, refLat) {
            const R = 111320; return { x: lng * R * Math.cos(refLat * Math.PI / 180), y: lat * R };
        }

        function distancePointToSegment(p, a, b) {
            const abx = b.x - a.x, aby = b.y - a.y;
            const apx = p.x - a.x, apy = p.y - a.y;
            const lenSq = abx * abx + aby * aby;
            let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const cx = a.x + t * abx, cy = a.y + t * aby;
            return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
        }

        function storesNearRoute(route, thresholdMeters = 400) {
            if(!route.points || route.points.length === 0) return [];
            const refLat = route.points[0][0];
            const routeXY = route.points.map(pt => toXY(pt[0], pt[1], refLat));
            const candidateStores = data.stores.filter(s => s.visitor === route.visitor);
            const nearby = [];
            candidateStores.forEach(store => {
                const p = toXY(store.lat, store.lng, refLat);
                let minDist = Infinity;
                for (let i = 0; i < routeXY.length - 1; i++) {
                    const d = distancePointToSegment(p, routeXY[i], routeXY[i + 1]);
                    if (d < minDist) minDist = d;
                }
                if (minDist <= thresholdMeters) nearby.push(store);
            });
            return nearby;
        }

        function showTodayRoute() {
            const visitor = document.getElementById('todayVisitorSelect').value;
            const resultDiv = document.getElementById('todayResult');
            resultDiv.style.display = 'block';
            todayRouteLayer.clearLayers();

            if (!visitor) {
                resultDiv.innerHTML = '<span class="muted">ابتدا یک ویزیتور انتخاب کنید.</span>';
                return;
            }

            const todayIdx = getIranianDay();
            const route = data.routes.find(r => r.visitor === visitor && r.day === todayIdx);

            if (!route) {
                resultDiv.innerHTML = `<span class="muted">برای <b>${visitor}</b> در روز <b>${dayNames[todayIdx]}</b> هنوز مسیری ثبت نشده است.</span>`;
                return;
            }

            L.polyline(route.points, { color: '#28a745', weight: 6, opacity: 0.8 }).addTo(todayRouteLayer);
            map.fitBounds(L.polyline(route.points).getBounds(), { padding: [30, 30] });

            const nearby = storesNearRoute(route);
            let html = `روز <b>${dayNames[todayIdx]}</b> - ویزیتور <b>${visitor}</b><br>`;
            html += `<span class="badge">${nearby.length} فروشگاه</span> در مسیر امروز (تقریبی)<br>`;
            if (nearby.length > 0) {
                html += '<ul>' + nearby.map(s => `<li>${s.name} (${s.type})</li>`).join('') + '</ul>';
            }
            resultDiv.innerHTML = html;
        }

        function logVisit(storeId) {
            const store = data.stores.find(s => s.id === storeId);
            if (!store) return;
            data.visits.push({
                id: Date.now(), storeId: store.id, storeName: store.name,
                visitor: store.visitor, timestamp: Date.now()
            });
            saveAllData();
            alert(`ویزیت از "${store.name}" برای ${store.visitor} ثبت شد.`);
        }

        const periodMs = { week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000, sixmonth: 182 * 24 * 60 * 60 * 1000, year: 365 * 24 * 60 * 60 * 1000 };
        const periodLabels = { week: 'یک هفته اخیر', month: 'یک ماه اخیر', sixmonth: 'شش ماه اخیر', year: 'یک سال اخیر' };

        function showReport() {
            const visitor = document.getElementById('reportVisitorSelect').value;
            const period = document.getElementById('reportPeriodSelect').value;
            const resultDiv = document.getElementById('reportResult');
            resultDiv.style.display = 'block';

            const cutoff = Date.now() - periodMs[period];
            let filtered = data.visits.filter(v => v.timestamp >= cutoff);
            if (visitor !== 'all') filtered = filtered.filter(v => v.visitor === visitor);

            if (filtered.length === 0) {
                resultDiv.innerHTML = `<span class="muted">در بازه «${periodLabels[period]}» هیچ ویزیتی ثبت نشده است.</span>`;
                return;
            }

            let html = `<b>بازه: ${periodLabels[period]}</b> - مجموع ویزیت‌ها: <span class="badge">${filtered.length}</span><br><br>`;
            if (visitor === 'all') {
                const counts = {};
                filtered.forEach(v => { counts[v.visitor] = (counts[v.visitor] || 0) + 1; });
                html += '<table><tr><th>ویزیتور</th><th>تعداد ویزیت</th></tr>';
                Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(name => {
                    html += `<tr><td>${name}</td><td>${counts[name]}</td></tr>`;
                });
                html += '</table>';
            } else {
                const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
                html += '<table><tr><th>فروشگاه</th><th>تاریخ و ساعت</th></tr>';
                sorted.forEach(v => {
                    const d = new Date(v.timestamp);
                    const dateStr = d.toLocaleDateString('fa-IR') + ' - ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
                    html += `<tr><td>${v.storeName}</td><td>${dateStr}</td></tr>`;
                });
                html += '</table>';
                if (filtered.length > 30) html += `<div class="muted">فقط ۳۰ مورد آخر نمایش داده شده است.</div>`;
            }
            resultDiv.innerHTML = html;
        }

        function clearData() {
            if (confirm("آیا مطمئن هستید؟ تمام ویزیتورها، فروشگاه‌ها، مسیرها، تسک‌ها و ویزیت‌ها پاک خواهند شد!")) {
                data = { visitors: [], stores: [], routes: [], visits: [], tasks: [], taskCompletions: [] };
                saveAllData();
                location.reload();
            }
        }

        fillDaySelect();
        fillTaskDaySelect();
        loadAllData();
