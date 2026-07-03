class TaskScheduler {
  constructor() {
    this.queue = [];
    this.running = new Map();
  }

  schedule(task) {
    const work = {
      id: task.id || `task-${Date.now()}`,
      task,
      status: 'pending',
      progress: 0,
      retries: 0,
    };
    this.queue.push(work);
    this.process();
    return work;
  }

  async process() {
    if (this.queue.length === 0) {
      return;
    }
    const work = this.queue.shift();
    this.running.set(work.id, work);
    work.status = 'running';
    try {
      const result = await work.task.execute({
        progress: (percent) => { work.progress = percent; },
        cancelToken: work.task.cancelToken,
      });
      work.status = 'completed';
      return result;
    } catch (error) {
      work.retries += 1;
      if (work.retries <= (work.task.retry || 0)) {
        this.queue.push(work);
      } else {
        work.status = 'failed';
      }
      throw error;
    } finally {
      this.running.delete(work.id);
    }
  }

  cancel(id) {
    const work = this.running.get(id);
    if (work && typeof work.task.cancel === 'function') {
      work.task.cancel();
      work.status = 'canceled';
    }
    return work;
  }
}

module.exports = { TaskScheduler };
