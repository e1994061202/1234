// 主要排班生成函數
async function generateSchedule() {
    // 獲取年份和月份
    const year = parseInt(document.getElementById('year').value);
    const month = parseInt(document.getElementById('month').value);
    const daysInCurrentMonth = daysInMonth(year, month);
    
    // 輸出詳細日誌
    console.log(`開始生成 ${year} 年 ${month} 月排班表（共 ${daysInCurrentMonth} 天）`);
    console.log('每個班次的需求人數：');
    console.log(`  白班：${getRequiredStaffForShift(SHIFTS.DAY)} 人`);
    console.log(`  小夜：${getRequiredStaffForShift(SHIFTS.EVENING)} 人`);
    console.log(`  大夜：${getRequiredStaffForShift(SHIFTS.NIGHT)} 人`);
    console.log('------------------------');

    // 初始化進度條
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    document.getElementById('progressDiv').style.display = 'block';

    // 預計算員工信息，提高後續操作效率
    precomputeStaffInfo();

    let bestResult = null;
    let bestScore = Infinity;
    const maxAttempts = 1000; // 最大嘗試次數
    
    // 多次嘗試生成排班表，選擇最佳結果
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`嘗試生成排班表 (第 ${attempt} 次) ...`);
        
        // 優化排班表
        const result = await optimizeSchedule(year, month);
        
        // 驗證排班表
        if (validateSchedule(result.schedule)) {
            console.log(`第 ${attempt} 次嘗試通過驗證`);
            
            // 如果找到更好的解決方案，更新最佳結果
            if (result.score < bestScore) {
                bestScore = result.score;
                bestResult = result.schedule;
                console.log("找到更好的解決方案！分數：", bestScore);
            }
            
            // 如果找到完美解決方案，提前結束
            if (bestScore === 0) {
                console.log("找到完美解決方案！");
                break;
            }
        } else {
            console.log(`第 ${attempt} 次嘗試未通過驗證，重新嘗試`);
        }
        
        // 更新進度條
        updateProgressBar((attempt / maxAttempts) * 100);
        // 允許UI更新
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // 處理最終結果
    if (bestResult) {
        console.log("最終評分：", bestScore);
        
        // 最後一次驗證
        if (validateSchedule(bestResult)) {
            console.log("最終排班表通過驗證");
            
            // 更新員工統計資料並顯示結果
            updateStaffStatistics(bestResult);
            displaySchedule(bestResult, year, month);
            displayScheduleMatrix(bestResult, year, month);
            displayStatistics(bestResult);
            
            // 輸出排班結果摘要
            console.log('------------------------');
            console.log('排班結果摘要：');
            let allMatchExpectation = true;
            staffList.forEach(staff => {
                const actualShifts = countStaffShifts(staff, bestResult);
                console.log(`  ${staff.name}：實際班數 ${actualShifts}，預期班數 ${staff.personalExpectedDays}，` +
                            `白班 ${staff.dayShiftCount}，` +
                            `小夜 ${staff.eveningShiftCount}，` +
                            `大夜 ${staff.nightShiftCount}`);
                if (actualShifts !== staff.personalExpectedDays) {
                    allMatchExpectation = false;
                }
            });
            
            if (allMatchExpectation) {
                console.log("成功生成滿足所有約束的排班表！");
            } else {
                console.log("警告：生成的排班表可能不完全滿足所有約束。");
            }
        } else {
            console.error("最終排班表未通過驗證，可能存在連續工作超過6天的情況");
            alert("生成的排班表不符合連續工作天數限制，請重試。");
        }
    } else {
        console.log('無法生成滿足所有約束的排班表。');
        alert("無法生成滿足所有約束的排班表。");
    }
    
    // 隱藏進度條
    document.getElementById('progressDiv').style.display = 'none';
}
// 添加一個新的驗證函數
function validateSchedule(schedule) {
    const daysInMonth = Object.keys(schedule).length;
    for (let staff of staffList) {
        let consecutiveWorkDays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            if (isStaffWorkingOnDay(staff, day, schedule)) {
                consecutiveWorkDays++;
                if (consecutiveWorkDays > 6) {
                    console.error(`驗證失敗：${staff.name} 在第 ${day} 天連續工作超過6天`);
                    return false;
                }
            } else {
                consecutiveWorkDays = 0;
            }
        }
    }
    return true;
}
// 修改 optimizeSchedule 函數
async function optimizeSchedule(year, month) {
    const daysInCurrentMonth = daysInMonth(year, month);
    let schedule = initializeSchedule(daysInCurrentMonth);
    let bestSchedule = JSON.parse(JSON.stringify(schedule));
    let bestScore = evaluateSchedule(schedule);
    
    const maxIterations = 10000;
    const maxNoImprovement = 1000;
    let noImprovementCount = 0;
    
    const tabuList = new Set();
    const tabuTenure = 50;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const { newSchedule, move } = generateNeighbor(schedule);
        const newScore = evaluateSchedule(newSchedule);
        
        if (!tabuList.has(move) && newScore < bestScore && validateSchedule(newSchedule)) {
            bestSchedule = JSON.parse(JSON.stringify(newSchedule));
            bestScore = newScore;
            schedule = newSchedule;
            noImprovementCount = 0;
            
            tabuList.add(move);
            if (tabuList.size > tabuTenure) {
                tabuList.delete(tabuList.values().next().value);
            }
        } else {
            noImprovementCount++;
        }
        
        if (noImprovementCount >= maxNoImprovement || bestScore === 0) {
            break;
        }
        
        if (iteration % 100 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    if (!validateSchedule(bestSchedule)) {
        console.error("最終排班表驗證失敗，可能存在連續工作超過6天的情況");
    }
    
    return { schedule: bestSchedule, score: bestScore };
}
// 初始化排班表
function initializeSchedule(daysInMonth) {
    let schedule = {};
    for (let day = 1; day <= daysInMonth; day++) {
        schedule[day] = {
            [SHIFTS.DAY]: [],
            [SHIFTS.EVENING]: [],
            [SHIFTS.NIGHT]: []
        };
    }
    
    const remainingShifts = new Map(staffList.map(staff => [staff.name, staff.personalExpectedDays]));
    
    for (let day = 1; day <= daysInMonth; day++) {
        for (let shift in SHIFTS) {
            const requiredStaff = getRequiredStaffForShift(SHIFTS[shift]);
            
            while (schedule[day][SHIFTS[shift]].length < requiredStaff) {
                const availableStaff = staffList.filter(staff => 
                    canAssignShift(staff, day, SHIFTS[shift], schedule) &&
                    remainingShifts.get(staff.name) > 0 &&
                    !wouldExceedConsecutiveWorkDays(staff, day, schedule, 'add')
                );
                
                if (availableStaff.length > 0) {
                    const randomStaff = availableStaff[Math.floor(Math.random() * availableStaff.length)];
                    schedule[day][SHIFTS[shift]].push(randomStaff.name);
                    remainingShifts.set(randomStaff.name, remainingShifts.get(randomStaff.name) - 1);
                } else {
                    break;
                }
            }
        }
    }
    
    return schedule;
}
// 預計算員工信息
function precomputeStaffInfo() {
    staffList.forEach(staff => {
        // 將員工的偏好班次轉換為Set以加快查詢速度
        staff.shiftPreferences = new Set([staff.shift1, staff.shift2]);
        // 將預休日轉換為Set
        staff.preVacationSet = new Set(staff.preVacationDates);
        // 將預排班信息轉換為Map
        staff.prescheduledMap = new Map(
            staff.prescheduledDates.map(p => [p.date, p.shift])
        );
    });
}
// 生成鄰居解
function generateNeighbor(schedule) {
    const daysInMonth = Object.keys(schedule).length;
    const day = Math.floor(Math.random() * daysInMonth) + 1;
    const shift = Object.values(SHIFTS)[Math.floor(Math.random() * 3)];
    const newSchedule = JSON.parse(JSON.stringify(schedule));
    
    const staffInShift = newSchedule[day][shift];
    if (staffInShift.length >= 2) {
        const index1 = Math.floor(Math.random() * staffInShift.length);
        let index2 = Math.floor(Math.random() * staffInShift.length);
        while (index2 === index1) {
            index2 = Math.floor(Math.random() * staffInShift.length);
        }
        
        const staff1 = staffList.find(s => s.name === staffInShift[index1]);
        const staff2 = staffList.find(s => s.name === staffInShift[index2]);
        
        // 檢查交換是否會導致連續工作超過6天
        const tempSchedule = JSON.parse(JSON.stringify(newSchedule));
        tempSchedule[day][shift][index1] = staff2.name;
        tempSchedule[day][shift][index2] = staff1.name;

        if (!wouldExceedConsecutiveWorkDays(staff1, day, tempSchedule, 'check') &&
            !wouldExceedConsecutiveWorkDays(staff2, day, tempSchedule, 'check')) {
            newSchedule[day][shift] = tempSchedule[day][shift];
        }
    }
    
    const move = `${day}-${shift}-${newSchedule[day][shift].join(',')}`;
    return { newSchedule, move };
}
// 修改排班表的輔助函數
function modifySchedule(schedule, day, shift) {
    const newSchedule = JSON.parse(JSON.stringify(schedule));
    const requiredStaff = getRequiredStaffForShift(shift);
    
    // 計算每個員工的當前班次數
    const currentShifts = new Map(staffList.map(staff => [staff.name, countStaffShifts(staff, newSchedule)]));
    
    // 如果當前班次人數不足，嘗試添加員工
    if (newSchedule[day][shift].length < requiredStaff) {
        const availableStaff = staffList.filter(staff => 
            !newSchedule[day][shift].includes(staff.name) &&
            canAssignShift(staff, day, shift, newSchedule) &&
            currentShifts.get(staff.name) < staff.personalExpectedDays
        );
        if (availableStaff.length > 0) {
            const newStaff = availableStaff[Math.floor(Math.random() * availableStaff.length)];
            newSchedule[day][shift].push(newStaff.name);
            currentShifts.set(newStaff.name, currentShifts.get(newStaff.name) + 1);
        }
    } 
    // 如果人數足夠或過多，嘗試替換員工
    else {
        // 隨機選擇要替換的員工
        const staffToReplace = newSchedule[day][shift][Math.floor(Math.random() * newSchedule[day][shift].length)];
        
        // 從可用員工中隨機選擇一個新員工
        const availableStaff = staffList.filter(staff => 
            !newSchedule[day][shift].includes(staff.name) &&
            canAssignShift(staff, day, shift, newSchedule) &&
            currentShifts.get(staff.name) < staff.personalExpectedDays
        );
        
        if (availableStaff.length > 0) {
            const newStaff = availableStaff[Math.floor(Math.random() * availableStaff.length)];
            const index = newSchedule[day][shift].indexOf(staffToReplace);
            if (index !== -1) {
                newSchedule[day][shift][index] = newStaff.name;
                currentShifts.set(staffToReplace, currentShifts.get(staffToReplace) - 1);
                currentShifts.set(newStaff.name, currentShifts.get(newStaff.name) + 1);
            }
        }
    }
    
    return newSchedule;
}
// 評估排班表變化的增量評分函數
function evaluateScheduleDelta(oldSchedule, newSchedule, move) {
    const [day, shift, staffString] = move.split('-');
    const dayNum = parseInt(day);
    const oldStaff = oldSchedule[day][shift];
    const newStaff = staffString.split(',');
    
    let scoreDiff = 0;
    
    // 1. 檢查班次人數變化
    const requiredStaff = getRequiredStaffForShift(shift);
    scoreDiff += (Math.abs(newStaff.length - requiredStaff) -
                  Math.abs(oldStaff.length - requiredStaff)) * 500;
    
    // 2. 檢查受影響的員工
    const affectedStaff = new Set([...oldStaff, ...newStaff]);
    affectedStaff.forEach(staffName => {
        const staff = staffList.find(s => s.name === staffName);
        const oldShifts = countStaffShifts(staff, oldSchedule);
        const newShifts = countStaffShifts(staff, newSchedule);
        
        // 2.1 檢查實際班數與預期班數的差異變化
        scoreDiff += (Math.abs(newShifts - staff.personalExpectedDays) - 
                      Math.abs(oldShifts - staff.personalExpectedDays)) * 1000;
        
        // 2.2 檢查是否符合員工的偏好班次
        if (!staff.shiftPreferences.has(shift)) {
            scoreDiff += newStaff.includes(staffName) ? 50 : -50;
        }
        
        // 2.3 檢查是否在預休日工作
        if (staff.preVacationSet.has(dayNum)) {
            scoreDiff += newStaff.includes(staffName) ? 1000 : -1000;
        }
        
        // 2.4 檢查是否符合預排班要求
        const prescheduledShift = staff.prescheduledMap.get(dayNum);
        if (prescheduledShift) {
            if (prescheduledShift === shift) {
                scoreDiff += newStaff.includes(staffName) ? -500 : 500;
            } else {
                scoreDiff += newStaff.includes(staffName) ? 500 : -500;
            }
        }
        
        // 2.5 檢查連續工作天數
        const oldExceedsConsecutive = wouldExceedConsecutiveWorkDays(staff, dayNum, oldSchedule);
        const newExceedsConsecutive = wouldExceedConsecutiveWorkDays(staff, dayNum, newSchedule);
        if (newExceedsConsecutive && !oldExceedsConsecutive) {
            scoreDiff += 1000; // 新排班違反連續工作天數限制
        } else if (!newExceedsConsecutive && oldExceedsConsecutive) {
            scoreDiff -= 1000; // 新排班修正了連續工作天數問題
        }
        
        // 2.6 檢查是否有禁止的班次連接
        if (dayNum > 1) {
            const prevDay = dayNum - 1;
            const oldPrevShift = getStaffShiftForDay(staff, prevDay, oldSchedule);
            const newPrevShift = getStaffShiftForDay(staff, prevDay, newSchedule);
            const oldCurrent = oldStaff.includes(staffName) ? shift : null;
            const newCurrent = newStaff.includes(staffName) ? shift : null;
            
            if (isForbiddenShiftConnection(oldPrevShift, oldCurrent) && 
                !isForbiddenShiftConnection(newPrevShift, newCurrent)) {
                scoreDiff -= 300;
            } else if (!isForbiddenShiftConnection(oldPrevShift, oldCurrent) && 
                       isForbiddenShiftConnection(newPrevShift, newCurrent)) {
                scoreDiff += 300;
            }
        }
    });
    
    return scoreDiff;
}
// 評估排班表的質量
function evaluateSchedule(schedule) {
    let score = 0;
    const daysInMonth = Object.keys(schedule).length;
    
    // 用於追蹤每個員工的個人得分
    const staffScores = new Map(staffList.map(staff => [staff.name, 0]));

    // 1. 檢查每個班次是否有指定數量的員工
    Object.values(SHIFTS).forEach(shift => {
        const requiredStaff = getRequiredStaffForShift(shift);
        Object.values(schedule).forEach(day => {
            score += Math.abs(day[shift].length - requiredStaff) * 500;
        });
    });

    // 2. 檢查每個員工的約束條件
    staffList.forEach(staff => {
        let actualShifts = 0;
        
        for (let day = 1; day <= daysInMonth; day++) {
            if (isStaffWorkingOnDay(staff, day, schedule)) {
                actualShifts++;
                const shift = getStaffShiftForDay(staff, day, schedule);
                
                // 2.1 檢查是否符合員工的偏好班次
                if (!staff.shiftPreferences.has(shift)) {
                    score += 50;
                    staffScores.set(staff.name, staffScores.get(staff.name) + 50);
                }
                
                // 2.2 檢查是否在預休日工作
                if (staff.preVacationSet.has(day)) {
                    score += 1000;
                    staffScores.set(staff.name, staffScores.get(staff.name) + 1000);
                }
                
                // 2.3 檢查是否符合預排班要求
                const prescheduledShift = staff.prescheduledMap.get(day);
                if (prescheduledShift && prescheduledShift !== shift) {
                    score += 500;
                    staffScores.set(staff.name, staffScores.get(staff.name) + 500);
                }
                
                // 2.4 檢查是否有禁止的班次連接
                if (day > 1) {
                    const previousShift = getStaffShiftForDay(staff, day - 1, schedule);
                    if (isForbiddenShiftConnection(previousShift, shift)) {
                        score += 300;
                        staffScores.set(staff.name, staffScores.get(staff.name) + 300);
                    }
                }
            }
        }
        
        // 2.5 檢查實際班數是否等於個人預期班數
        const scoreDiff = Math.abs(actualShifts - staff.personalExpectedDays);
        score += scoreDiff * 1000;
        staffScores.set(staff.name, staffScores.get(staff.name) + scoreDiff * 1000);
    });

    return score;
}
// 檢查是否可以為員工分配指定的班次
function canAssignShift(staff, day, shift, schedule) {
    // 檢查是否是預休日
    if (isPreVacationDay(staff, day)) {
        return false;
    }

    // 檢查是否符合預先排班
    if (!isPrescheduledShiftRespected(staff, day, shift)) {
        return false;
    }

    // 檢查是否會造成禁止的班次連接
    if (wouldCreateForbiddenShiftConnection(staff, day, shift, schedule)) {
        return false;
    }

    // 檢查是否會超過連續工作天數
    if (wouldExceedConsecutiveWorkDays(staff, day, schedule)) {
        return false;
    }

    // 檢查是否符合員工的偏好班次
    if (staff.shift1 !== shift && staff.shift2 !== shift) {
        return false;
    }

    // 檢查員工在該天是否已被分配班次
    if (isStaffAssignedOnDay(staff, day, schedule)) {
        return false;
    }

    return true;
}
// 計算員工在排班表中的班次數
function countStaffShifts(staff, schedule) {
    return Object.values(schedule).reduce((count, day) => {
        return count + Object.values(day).filter(shift => shift.includes(staff.name)).length;
    }, 0);
}
// 檢查員工是否已經在該天被分配了班次
function isStaffAssignedOnDay(staff, day, schedule) {
    return Object.values(schedule[day]).some(shift => shift.includes(staff.name));
}
// 更新進度條
function updateProgressBar(percentage) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = percentage + '%';
    progressBar.textContent = Math.round(percentage) + '%';
}
// 檢查員工是否已經在該天被分配了班次
function isStaffAssignedOnDay(staff, day, schedule) {
    return Object.values(schedule[day]).some(shift => shift.includes(staff.name));
}
// 更新員工統計資料
function updateStaffStatistics(schedule) {
    staffList.forEach(staff => {
        staff.actualShiftDays = 0;
        staff.dayShiftCount = 0;
        staff.eveningShiftCount = 0;
        staff.nightShiftCount = 0;
        
        Object.values(schedule).forEach(day => {
            if (day[SHIFTS.DAY].includes(staff.name)) {
                staff.actualShiftDays++;
                staff.dayShiftCount++;
            }
            if (day[SHIFTS.EVENING].includes(staff.name)) {
                staff.actualShiftDays++;
                staff.eveningShiftCount++;
            }
            if (day[SHIFTS.NIGHT].includes(staff.name)) {
                staff.actualShiftDays++;
                staff.nightShiftCount++;
            }
        });
    });
}
function displayStatistics(schedule) {
    const statisticsTable = document.getElementById('statisticsTable');
    
    let tableHTML = `
        <table class="statistics-table">
            <thead>
                <tr>
                    <th>員工名稱</th>
                    <th>個人預期班數</th>
                    <th>實際班數</th>
                    <th>白班天數</th>
                    <th>小夜天數</th>
                    <th>大夜天數</th>
                </tr>
            </thead>
            <tbody>
    `;

    staffList.forEach(staff => {
        const expectedDays = staff.personalExpectedDays;
        let actualDays = 0;
        let dayShiftDays = 0;
        let eveningShiftDays = 0;
        let nightShiftDays = 0;

        for (let day = 1; day <= Object.keys(schedule).length; day++) {
            if (schedule[day][SHIFTS.DAY].includes(staff.name)) {
                dayShiftDays++;
                actualDays++;
            }
            if (schedule[day][SHIFTS.EVENING].includes(staff.name)) {
                eveningShiftDays++;
                actualDays++;
            }
            if (schedule[day][SHIFTS.NIGHT].includes(staff.name)) {
                nightShiftDays++;
                actualDays++;
            }
        }

        tableHTML += `
            <tr>
                <td>${staff.name}</td>
                <td>${expectedDays}</td>
                <td>${actualDays}</td>
                <td>${dayShiftDays}</td>
                <td>${eveningShiftDays}</td>
                <td>${nightShiftDays}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    statisticsTable.innerHTML = tableHTML;
}
// 添加 displayScheduleMatrix 函數
function displayScheduleMatrix(schedule, year, month) {
    const scheduleMatrixDiv = document.getElementById('scheduleMatrix');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    let tableHTML = `
        <table class="schedule-matrix">
            <thead>
                <tr>
                    <th>人員 \ 日期</th>
    `;
    
    for (let day = 1; day <= Object.keys(schedule).length; day++) {
        const date = new Date(year, month - 1, day);
        const weekday = weekdays[date.getDay()];
        tableHTML += `<th>${month}/${day}<br>(${weekday})</th>`;
    }
    
    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;
    
    staffList.forEach(staff => {
        tableHTML += `
            <tr>
                <td>${staff.name}</td>
        `;
        
        for (let day = 1; day <= Object.keys(schedule).length; day++) {
            let shiftForDay = '';
            if (schedule[day][SHIFTS.DAY].includes(staff.name)) {
                shiftForDay = '白';
            } else if (schedule[day][SHIFTS.EVENING].includes(staff.name)) {
                shiftForDay = '小';
            } else if (schedule[day][SHIFTS.NIGHT].includes(staff.name)) {
                shiftForDay = '大';
            }
            tableHTML += `<td>${shiftForDay}</td>`;
        }
        
        tableHTML += `
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    scheduleMatrixDiv.innerHTML = tableHTML;
}
// 顯示排班表
function displaySchedule(schedule, year, month) {
    const scheduleTable = document.getElementById('scheduleTable');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    let tableHTML = `
        <table class="schedule-table">
            <thead>
                <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>白班</th>
                    <th>小夜</th>
                    <th>大夜</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let day = 1; day <= Object.keys(schedule).length; day++) {
        const date = new Date(year, month - 1, day);
        const weekday = weekdays[date.getDay()];
        
        tableHTML += `
            <tr>
                <td>${month}/${day}</td>
                <td>${weekday}</td>
                <td>${schedule[day][SHIFTS.DAY].join(', ')}</td>
                <td>${schedule[day][SHIFTS.EVENING].join(', ')}</td>
                <td>${schedule[day][SHIFTS.NIGHT].join(', ')}</td>
            </tr>
        `;
    }

    tableHTML += `
            </tbody>
        </table>
    `;

    scheduleTable.innerHTML = tableHTML;
    console.log("Schedule to display:", schedule);
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    const generateButton = document.getElementById('generateScheduleBtn');
    console.log("Generate button:", generateButton);
    if (generateButton) {
        generateButton.addEventListener('click', generateSchedule);
        console.log("Event listener added to generate button");
    }
});