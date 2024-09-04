const TelegramBot = require("node-telegram-bot-api")
require("dotenv").config()
const fs = require("fs")
const path = require("path")

const BOT_TOKEN = process.env.reminderBot_token || "0"

const bot = new TelegramBot(BOT_TOKEN, {
	polling: true,
})

bot.on("polling_error", (err) => {
	console.error(err.message)
})
let commands = ["Добавить напоминание", "Выполнить или изменить напоминание"]
let tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tasks.json"))) || []
let pool = {}
let LevelsOfTimer = {
	0: [2 * 3600 * 1000, "2 часа"], //2 часа
	1: [8 * 3600 * 1000, "8 часов"], //8 часов
	2: [12 * 3600 * 1000, "12 часов"], //12 часов
	3: [24 * 3600 * 1000, "24 часа"], //24 часа
	4: [48 * 3600 * 1000, "48 часов"], //48 часа
	5: [24 * 7 * 3600 * 1000, "1 неделя"], // 1 неделя
	6: [24 * 14 * 3600 * 1000, "2 недели"], // 2 недели
	7: [24 * 30 * 3600 * 1000, "месяц"], // месяц
}

setInterval(async () => {
	let timeNow = new Date().getTime()
	tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tasks.json"))) || []
	for (let item of tasks) {
		if (timeNow - item.creationTime > LevelsOfTimer[item.timerLevel][0] && item.status == "active") {
			await bot.sendMessage(item.creator, `Напоминание: ${item.title}. Прошедшее время: ~${LevelsOfTimer[item.timerLevel][1]}`, {
				reply_markup: {
					keyboard: [["Добавить напоминание"], ["Выполнить или изменить напоминание"]],
				},
			})
			item.status = "waiting"
			fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), JSON.stringify(tasks))
		}
	}
}, 600_000)
bot.onText(/Добавить напоминание/, async (message) => {
	if (pool[chatID]) {
		pool[chatID].target = null
	} else {
		pool[chatID] = {
			target: null,
			creator: chatID,
		}
	}
	let chatID = message.chat.id
	await bot.sendMessage(chatID, "Пожалуйста, введите название для напоминания.", {
		reply_markup: {
			keyboard: [["Добавить напоминание"], ["Выполнить или изменить напоминание"]],
		},
	})
	if (pool[chatID]) {
		pool[chatID].target = "addRemindersTitle"
	} else {
		pool[chatID] = {
			target: "addRemindersTitle",
			creator: chatID,
		}
	}
})
bot.onText(/Выполнить или изменить напоминание/, async (message) => {
	if (pool[chatID]) {
		pool[chatID].target = null
	} else {
		pool[chatID] = {
			target: null,
			creator: chatID,
		}
	}
	tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tasks.json"))) || []
	let chatID = message.chat.id
	if (tasks.length === 0) return await bot.sendMessage("Напоминаний нет.")
	await bot.sendMessage(chatID, "Пожалуйста, выберите напоминание из списка.", {
		reply_markup: {
			keyboard: [["Добавить напоминание"], ["Выполнить или изменить напоминание"]],
		},
	})
	let waitingTasks = []
	let activeTasks = []
	for (let item of tasks) {
		if (item.creator != chatID) continue
		if (item.status == "active") activeTasks.push(item)
		if (item.status == "waiting") waitingTasks.push(item)
	}
	if (waitingTasks.length > 0) await bot.sendMessage(chatID, "Напоминания с прошедшим таймером, ожидающие выполнения.")
	for (let item of waitingTasks) {
		await bot.sendMessage(
			chatID,
			`Напоминание: ${item.title}. \nДата создания: ${new Date(item.creationTime)}. \nНапоминание через: ${LevelsOfTimer[item.timerLevel][1]}`,
			{
				reply_markup: {
					inline_keyboard: [
						[{ text: "Выполнить", callback_data: JSON.stringify({ data: item.creationTime, target: "complete" }) }],
						[{ text: "Изменить", callback_data: JSON.stringify({ data: item.creationTime, target: "edit" }) }],
					],
				},
			}
		)
	}
	if (activeTasks.length > 0) await bot.sendMessage(chatID, "Напоминания с активным таймером, ожидающие своего времени.")
	for (let item of activeTasks) {
		await bot.sendMessage(
			chatID,
			`Напоминание: ${item.title}. \nДата создания: ${new Date(item.creationTime)}. \nНапоминание через: ${LevelsOfTimer[item.timerLevel][1]}`,
			{
				reply_markup: {
					inline_keyboard: [
						[{ text: "Выполнить", callback_data: JSON.stringify({ data: item.creationTime, target: "complete" }) }],
						[{ text: "Изменить", callback_data: JSON.stringify({ data: item.creationTime, target: "edit" }) }],
					],
				},
			}
		)
	}
})
bot.on("message", async (message) => {
	let chatID = message.chat.id
	if (commands.includes(message.text)) return
	if (!pool[chatID]) return
	if (pool[chatID].target == "addRemindersTitle") {
		let remindersTitle = message.text
		tasks.push({ title: remindersTitle, status: "active", timerLevel: 0, creator: chatID, creationTime: new Date().getTime() })
		fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), JSON.stringify(tasks))
		pool[chatID].target = null
		await bot.sendMessage(chatID, "Напоминание успешно добавлено.")
	}
	if (pool[chatID].target == "editTitle") {
		tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tasks.json"))) || []
		let item = null
		for (let task of tasks) {
			if (task.creationTime === pool[chatID].data.data) {
				item = task
			}
		}
		if (!item) {
			return await bot.sendMessage(chatID, "Что-то пошло не так. Попробуйте снова.")
		}
		let newTitle = message.text
		item.title = newTitle
		fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), JSON.stringify(tasks))
		pool[chatID].target = null
		await bot.sendMessage(chatID, "Напоминание успешно изменилось.")
	}
	if (pool[chatID].target == "editTimer") {
		tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tasks.json"))) || []
		let item = null
		for (let task of tasks) {
			console.log(task.creationTime, pool[chatID])
			if (task.creationTime === pool[chatID].data.data) {
				item = task
			}
		}
		if (!item) {
			return await bot.sendMessage(chatID, "Что-то пошло не так. Попробуйте снова.")
		}
		let newTimer = message.text
		while (!(newTimer >= 0 && newTimer <= 7)) {
			await bot.sendMessage(chatID, "Номер должен быть от 0 до 7 включительно.")
		}
		item.timerLevel = newTimer
		item.creationTime = new Date().getTime()
		fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), JSON.stringify(tasks))
		await bot.sendMessage(chatID, "Дедлайн успешно обновился и таймер обнулился.")
		pool[chatID].target = null
	}
})
bot.on("callback_query", async (message) => {
	let chatID = message.message.chat.id
	let data = JSON.parse(message.data)
	tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tasks.json"))) || []

	if (data.target == "complete") {
		let item = null
		for (let task of tasks) {
			if (task.creationTime === data.data) {
				item = task
			}
		}
		if (!item) {
			bot.answerCallbackQuery(message.id)
			return await bot.sendMessage(chatID, "Что-то пошло не так. Попробуйте снова.")
		}
		item.status = "active"
		item.timerLevel + 1 > 7 ? 7 : item.timerLevel++
		item.creationTime = new Date().getTime()
		fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), JSON.stringify(tasks))

		await bot.sendMessage(chatID, "Напоминание успешно выполнилось, таймер обновился.")
		bot.answerCallbackQuery(message.id)
	}
	if (data.target == "edit") {
		let item = null
		for (let task of tasks) {
			if (task.creationTime === data.data) {
				item = task
			}
		}
		if (!item) {
			bot.answerCallbackQuery(message.id)
			return await bot.sendMessage(chatID, "Что-то пошло не так. Попробуйте снова.")
		}
		await bot.sendMessage(chatID, "Что меняем у напоминания?", {
			reply_markup: {
				inline_keyboard: [
					[{ text: "Изменить название", callback_data: JSON.stringify({ data: item.creationTime, target: "editTitle" }) }],
					[{ text: "Изменить таймер", callback_data: JSON.stringify({ data: item.creationTime, target: "editTimer" }) }],
					[{ text: "Удалить", callback_data: JSON.stringify({ data: item.creationTime, target: "delete" }) }],
				],
			},
		})
		bot.answerCallbackQuery(message.id)
	}
	if (data.target == "editTitle") {
		await bot.sendMessage(chatID, "Введите новое название для напоминания.")
		bot.answerCallbackQuery(message.id)
		if (pool[chatID]) {
			pool[chatID].target = "editTitle"
			pool[chatID].data = data.data
		} else {
			pool[chatID] = {
				target: "editTitle",
				creator: chatID,
				data: data,
			}
		}
	}
	if (data.target == "editTimer") {
		await bot.sendMessage(chatID, "Введите номер уровня таймера исходя из таблицы ниже:")
		let text = ""
		for (let item of Object.keys(LevelsOfTimer)) {
			text += `${item}: Напомнить через ${LevelsOfTimer[item][1]}\n`
		}
		await bot.sendMessage(chatID, text)
		bot.answerCallbackQuery(message.id)
		if (pool[chatID]) {
			pool[chatID].target = "editTimer"
			pool[chatID].data = data.data
		} else {
			pool[chatID] = {
				target: "editTimer",
				creator: chatID,
				data: data,
			}
		}
	}
	if (data.target == "delete") {
		let itemIndex = null
		for (let i = 0; i < tasks.length; i++) {
			if (tasks[i].creationTime === data.data) {
				itemIndex = i
			}
		}
		if (itemIndex === null) {
			bot.answerCallbackQuery(message.id)
			return await bot.sendMessage(chatID, "Что-то пошло не так. Попробуйте снова.")
		}
		tasks.splice(itemIndex, 1)
		fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), JSON.stringify(tasks))
		bot.answerCallbackQuery(message.id)
		await bot.sendMessage(chatID, "Напоминание успешно удалилось.")
	}
})
