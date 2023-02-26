const core = require('@actions/core');
const AWS = require('aws-sdk');

const ecs = new AWS.ECS();

const main = async () => {
  const cluster = core.getInput('cluster', { required: true });
  const service = core.getInput('service', { required: true });
  const name = core.getInput('name', { required: true });
  const waitForFinish = core.getBooleanInput('wait-for-finish', {
    required: false,
  });
  const stopExisting = core.getBooleanInput('stop-existing', {
    required: false,
  });
  const overrideContainer = core.getInput('override-container', {
    required: false,
  });
  const overrideContainerCommand = core.getMultilineInput(
    'override-container-command',
    { required: false }
  );
  if (name == 'service') {
    throw new Error(`Cannot start a task called 'service'`);
  }

  try {
    // Get network configuration from aws directly from describe services
    core.debug('Getting information from service');
    const info = await ecs
      .describeServices({ cluster, services: [service] })
      .promise();

    if (!info || !info.services[0]) {
      throw new Error(
        `Could not find service ${service} in cluster ${cluster}`
      );
    }

    const taskDefinition = info.services[0].taskDefinition;
    const taskDefinitionName = taskDefinition
      .split('/')
      .pop()
      .split(':')
      .shift();
    // core.setOutput('task-definition', taskDefinition);
    core.info('Using task definition ' + taskDefinitionName);

    if (stopExisting) {
      const existingARNs = await ecs
        .listTasks({ cluster, family: taskDefinitionName })
        .promise();
      if (
        existingARNs &&
        existingARNs.taskArns &&
        existingARNs.taskArns.length > 0
      ) {
        const existing = await ecs
          .describeTasks({
            cluster,
            tasks: existingARNs.taskArns,
          })
          .promise();
        if (existing && existing.tasks) {
          const tasksIds = existing.tasks
            .filter((t) => t.group == name + ':' + service)
            .map((t) => t.taskArn.split('/').pop());
          for (let i = 0; i < tasksIds.length; i++) {
            core.info('Stopping existing task ID ' + tasksIds[i]);
            const done = await ecs
              .stopTask({ cluster, task: tasksIds[i] })
              .promise();
            core.info(done);
          }
        } else {
          core.info('No existing tasks found');
        }
      } else {
        core.info('No existing task ARNs found');
      }
    } else {
      core.info('Not stopping existing tasks');
    }

    const taskParams = {
      taskDefinition,
      cluster,
      launchType: info.services[0].launchType,
      group: name + ':' + service,
    };

    if (info.services[0].networkConfiguration) {
      taskParams.networkConfiguration = info.services[0].networkConfiguration;
    }

    if (overrideContainerCommand.length > 0 && !overrideContainer) {
      throw new Error(
        'override-container is required when override-container-command is set'
      );
    }

    if (overrideContainer) {
      if (overrideContainerCommand) {
        taskParams.overrides = {
          containerOverrides: [
            {
              name: overrideContainer,
              command: overrideContainerCommand,
            },
          ],
        };
      } else {
        throw new Error(
          'override-container-command is required when override-container is set'
        );
      }
    }

    core.debug('Running task');
    let task = await ecs.runTask(taskParams).promise();
    const taskArn = task.tasks[0].taskArn;
    // core.setOutput('task-arn', taskArn);

    if (waitForFinish) {
      core.debug('Waiting for task to finish');
      await ecs
        .waitFor('tasksStopped', { cluster, tasks: [taskArn] })
        .promise();

      core.debug('Checking status of task');
      task = await ecs.describeTasks({ cluster, tasks: [taskArn] }).promise();
      const exitCode = task.tasks[0].containers[0].exitCode;

      if (exitCode === 0) {
        // core.setOutput('status', 'success');
      } else {
        core.setFailed(task.tasks[0].stoppedReason);

        const taskHash = taskArn.split('/').pop();
        core.info(
          `Task failed, you can check the error on Amazon ECS console: https://console.aws.amazon.com/ecs/home?region=${AWS.config.region}#/clusters/${cluster}/tasks/${taskHash}/details`
        );
      }
    } else {
      // core.setOutput('status', 'success');
    }
  } catch (error) {
    core.setFailed(error);
  }
};

main();
